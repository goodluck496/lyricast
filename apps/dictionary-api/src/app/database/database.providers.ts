import { Logger, Provider } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../lib/db/schema';

export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');

const MAX_ERROR_CAUSE_DEPTH = 8; // Защита от слишком глубоких/циклических цепочек error.cause/errors
const RECONNECT_DELAY_MS = 5000; // Пауза между попытками подключения/реконнекта, чтобы не устраивать шторм запросов

async function ensurePoolConnected(pool: Pool): Promise<void> {
  const client = await pool.connect();
  client.release();
}

function isTransientPgError(error: unknown): boolean {
  const visit = (err: unknown, depth: number): boolean => {
    if (depth > MAX_ERROR_CAUSE_DEPTH) return false;
    if (typeof err !== 'object' || err === null) return false;

    const code =
      'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : undefined;

    if (
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'EPIPE' ||
      code === 'ENOTFOUND' ||
      // Postgres/server restart related
      code === '57P01' ||
      code === '57P02' ||
      code === '57P03'
    ) {
      return true;
    }

    const message =
      'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : '';
    const lower = message.toLowerCase();
    if (
      lower.includes('connection terminated') ||
      lower.includes('timeout') ||
      lower.includes('etimedout')
    ) {
      return true;
    }

    if ('cause' in err) {
      const next = (err as { cause?: unknown }).cause;
      if (visit(next, depth + 1)) return true;
    }

    if ('errors' in err && Array.isArray((err as { errors?: unknown }).errors)) {
      const list = (err as { errors: unknown[] }).errors;
      if (list.some((e) => visit(e, depth + 1))) return true;
    }

    return false;
  };

  return visit(error, 0);
}

type PoolEventName = Parameters<Pool['on']>[0];
type PoolListener = Parameters<Pool['on']>[1];

class ReconnectingPool {
  private pool: Pool;
  private reconnecting: Promise<void> | null = null;
  private readonly listeners = new Map<PoolEventName, Set<PoolListener>>();

  constructor(
    private readonly config: PoolConfig,
    private readonly logger: Logger,
  ) {
    this.pool = this.createPool();
  }

  get current(): Pool {
    return this.pool;
  }

  useExistingPool(pool: Pool): void {
    this.pool = pool;
  }

  on(event: PoolEventName, listener: PoolListener): Pool {
    const existing = this.listeners.get(event) ?? new Set<PoolListener>();
    existing.add(listener);
    this.listeners.set(event, existing);

    this.pool.on(event, listener);
    return this.pool;
  }

  query(...args: Parameters<Pool['query']>): Promise<unknown> {
    return (this.pool.query as (...a: unknown[]) => Promise<unknown>)(...args).catch(
      async (error) => {
        if (!isTransientPgError(error)) throw error;
        await this.reconnect(error);
        return (this.pool.query as (...a: unknown[]) => Promise<unknown>)(...args);
      }
    );
  }

  connect(...args: Parameters<Pool['connect']>): Promise<unknown> {
    return (this.pool.connect as (...a: unknown[]) => Promise<unknown>)(...args).catch(
      async (error) => {
        if (!isTransientPgError(error)) throw error;
        await this.reconnect(error);
        return (this.pool.connect as (...a: unknown[]) => Promise<unknown>)(...args);
      }
    );
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  private createPool(): Pool {
    const pool = new Pool(this.config);

    // Всегда логируем ошибки пула, даже если никто не подписался
    pool.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ошибка пула Postgres: ${message}`);

      if (isTransientPgError(error)) {
        void this.reconnect(error);
      }
    });

    for (const [event, set] of this.listeners.entries()) {
      for (const listener of set) {
        pool.on(event, listener);
      }
    }

    return pool;
  }

  private async reconnect(error: unknown): Promise<void> {
    if (this.reconnecting) {
      await this.reconnecting;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Потеряно соединение с Postgres, пересоздаю пул: ${message}`);

    this.reconnecting = (async () => {
      const old = this.pool;
      try {
        await old.end();
      } catch {
        // ignore
      }

      for (let attempt = 1; ; attempt += 1) {
        this.logger.warn(`Reconnect к Postgres. Попытка: ${attempt}`);
        const next = this.createPool();
        try {
          await ensurePoolConnected(next);
          this.pool = next;
          this.logger.log(`Reconnect к Postgres успешен. Попыток: ${attempt}`);
          return;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Reconnect не удался (попытка ${attempt}): ${errMsg}`);
          await next.end().catch(() => undefined);
          await wait(RECONNECT_DELAY_MS);
        }
      }
    })();

    try {
      await this.reconnecting;
    } finally {
      this.reconnecting = null;
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function redactConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const hadUsername = url.username.trim() !== '';
    const hadPassword = url.password.trim() !== '';

    if (hadUsername) url.username = '***';
    if (hadPassword) url.password = '***';

    if (!hadUsername && !hadPassword) return url.toString();
    return url.toString();
  } catch {
    return connectionString;
  }
}

function buildPoolConfig(): PoolConfig {
  const url = process.env.DICTIONARY_DB_URL ?? process.env.DATABASE_URL;
  const sslEnv = process.env.DICTIONARY_DB_SSL;

  const parseSslEnv = (): boolean | undefined => {
    if (!sslEnv) return undefined;
    const normalized = sslEnv.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'require' || normalized === 'required') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'disable' || normalized === 'disabled') {
      return false;
    }
    return undefined;
  };

  const shouldUseSslByDefault = (connection: string | undefined): boolean => {
    const fromEnv = parseSslEnv();
    if (fromEnv !== undefined) return fromEnv;

    if (typeof connection !== 'string') return false;
    const lower = connection.toLowerCase();
    return lower.includes('supabase.com') || lower.includes('supabase.co') || lower.includes('render.com');
  };

  if (url && url.trim() !== '') {
    return {
      connectionString: url,
      ssl: shouldUseSslByDefault(url) ? { rejectUnauthorized: false } : undefined,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 60_000,
      min: 1,
      max: 10
    };
  }

  // Альтернатива через раздельные env-переменные для CI/CD
  return {
    host: process.env.DICTIONARY_DB_HOST ?? 'localhost',
    port: Number(process.env.DICTIONARY_DB_PORT ?? 5432),
    database: process.env.DICTIONARY_DB_NAME ?? 'dictionary',
    user: process.env.DICTIONARY_DB_USER ?? 'user',
    password: process.env.DICTIONARY_DB_PASSWORD ?? 'password',
    ssl: shouldUseSslByDefault(process.env.DICTIONARY_DB_HOST) ? { rejectUnauthorized: false } : undefined,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 60_000,
  };
}

export const pgPoolProvider: Provider = {
  provide: PG_POOL,
  useFactory: async (): Promise<Pool> => {
    const logger = new Logger('PG_POOL');
    const config = buildPoolConfig();

    const hasConnString = typeof config.connectionString === 'string' && config.connectionString.trim() !== '';
    const safeConnString = hasConnString ? redactConnectionString(config.connectionString as string) : undefined;
    const sslEnabled = typeof config.ssl === 'object' && config.ssl !== null;
    logger.log(
      `PG config: mode=${hasConnString ? 'connectionString' : 'parts'} ssl=${sslEnabled} ` +
        `host=${String((config as PoolConfig).host ?? '')} port=${String((config as PoolConfig).port ?? '')} ` +
        `db=${String((config as PoolConfig).database ?? '')} user=${String((config as PoolConfig).user ?? '')} ` +
        `url=${safeConnString ?? ''}`,
    );

    for (let attempt = 1; ; attempt += 1) {
      logger.log(`Подключение к Postgres. Попытка: ${attempt}`);

      const pool = new Pool(config);

      try {
        await ensurePoolConnected(pool);
        logger.log(`Подключение к Postgres успешно. Попыток: ${attempt}`);

        const reconnecting = new ReconnectingPool(config, logger);
        // Подменяем внутренний пул на тот, что уже успешно подключился
        // (чтобы не делать лишний коннект на старте)
        reconnecting.useExistingPool(pool);

        const proxy = new Proxy({} as Pool, {
          get: (_target, prop, _receiver) => {
            if (prop === 'query') return reconnecting.query.bind(reconnecting);
            if (prop === 'connect') return reconnecting.connect.bind(reconnecting);
            if (prop === 'end') return reconnecting.end.bind(reconnecting);
            if (prop === 'on') return reconnecting.on.bind(reconnecting);

            const value = (reconnecting.current as unknown as Record<PropertyKey, unknown>)[prop];
            if (typeof value === 'function') {
              return (value as (...args: unknown[]) => unknown).bind(reconnecting.current);
            }
            return value;
          },
          set: (_target, prop, value) => {
            (reconnecting.current as unknown as Record<PropertyKey, unknown>)[prop] = value;
            return true;
          },
        });

        return proxy;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Не удалось подключиться к Postgres (попытка ${attempt}): ${message}`);
        await pool.end().catch(() => undefined);
        await wait(RECONNECT_DELAY_MS);
      }
    }

    throw new Error('Не удалось подключиться к Postgres после максимального количества попыток');
  },
};

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (pool: Pool) => drizzle(pool, { schema }),
  inject: [PG_POOL],
};
