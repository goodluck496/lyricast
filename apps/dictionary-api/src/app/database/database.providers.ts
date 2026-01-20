import { Logger, Provider } from '@nestjs/common';
import postgres, { type Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../lib/db/schema';

export const POSTGRES_CLIENT = Symbol('POSTGRES_CLIENT');
export const DRIZZLE = Symbol('DRIZZLE');

const MAX_ERROR_CAUSE_DEPTH = 8; // Защита от слишком глубоких/циклических цепочек error.cause/errors
const RECONNECT_DELAY_MS = 5000; // Пауза между попытками подключения/реконнекта, чтобы не устраивать шторм запросов

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

type PostgresClientConfig =
  | {
      url: string;
      ssl?: { rejectUnauthorized: false };
      max: number;
      connect_timeout: number;
      idle_timeout: number;
      keep_alive: number;
    }
  | {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
      ssl?: { rejectUnauthorized: false };
      max: number;
      connect_timeout: number;
      idle_timeout: number;
      keep_alive: number;
    };

function buildPostgresClientConfig(): PostgresClientConfig {
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
      ssl: shouldUseSslByDefault(url) ? { rejectUnauthorized: false } : undefined,
      url,
      max: 10,
      connect_timeout: 30,
      idle_timeout: 60,
      keep_alive: 10,
    };
  }

  // Альтернатива через раздельные env-переменные для CI/CD
  return {
    host: process.env.DICTIONARY_DB_HOST ?? 'localhost',
    port: Number(process.env.DICTIONARY_DB_PORT ?? 5432),
    database: process.env.DICTIONARY_DB_NAME ?? 'dictionary',
    username: process.env.DICTIONARY_DB_USER ?? 'user',
    password: process.env.DICTIONARY_DB_PASSWORD ?? 'password',
    ssl: shouldUseSslByDefault(process.env.DICTIONARY_DB_HOST) ? { rejectUnauthorized: false } : undefined,
    max: 10,
    connect_timeout: 10,
    idle_timeout: 60,
    keep_alive: 10,
  };
}

async function ensurePostgresConnected(sql: Sql): Promise<void> {
  await sql`select 1`;
}

export const postgresClientProvider: Provider = {
  provide: POSTGRES_CLIENT,
  useFactory: async (): Promise<Sql> => {
    const logger = new Logger('POSTGRES_CLIENT');
    const config = buildPostgresClientConfig();

    const hasConnString = 'url' in config;
    const safeConnString = hasConnString ? redactConnectionString(config.url) : undefined;
    const sslEnabled = typeof config.ssl === 'object' && config.ssl !== null;

    logger.log(
      `Postgres-js config: mode=${hasConnString ? 'connectionString' : 'parts'} ssl=${sslEnabled} ` +
        `host=${String(hasConnString ? '' : config.host)} port=${String(hasConnString ? '' : config.port)} ` +
        `db=${String(hasConnString ? '' : config.database)} user=${String(hasConnString ? '' : config.username)} ` +
        `url=${safeConnString ?? ''}`,
    );

    for (let attempt = 1; ; attempt += 1) {
      logger.log(`Подключение к Postgres (postgres-js). Попытка: ${attempt}`);

      const sql =
        'url' in config
          ? postgres(config.url, {
              ssl: config.ssl,
              max: config.max,
              connect_timeout: config.connect_timeout,
              idle_timeout: config.idle_timeout,
              keep_alive: config.keep_alive,
            })
          : postgres({
              host: config.host,
              port: config.port,
              database: config.database,
              username: config.username,
              password: config.password,
              ssl: config.ssl,
              max: config.max,
              connect_timeout: config.connect_timeout,
              idle_timeout: config.idle_timeout,
              keep_alive: config.keep_alive,
            });

      try {
        await ensurePostgresConnected(sql);
        logger.log(`Подключение к Postgres успешно. Попыток: ${attempt}`);
        return sql;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Не удалось подключиться к Postgres (попытка ${attempt}): ${message}`);

        if (!isTransientPgError(error)) {
          await sql.end({ timeout: 1 });
          throw error;
        }

        await sql.end({ timeout: 1 });
        await wait(RECONNECT_DELAY_MS);
      }
    }
  },
};

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (client: Sql) => drizzle(client, { schema }),
  inject: [POSTGRES_CLIENT],
};
