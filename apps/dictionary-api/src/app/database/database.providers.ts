import { Logger, Provider } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../lib/db/schema';

export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');

async function ensurePoolConnected(pool: Pool): Promise<void> {
  const client = await pool.connect();
  client.release();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildPoolConfig(): PoolConfig {
  const url = process.env.DICTIONARY_DB_URL;
  if (url && url.trim() !== '') {
    return {
      connectionString: url,
      ssl:
        process.env.DICTIONARY_DB_SSL === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 60_000,
    };
  }

  // Альтернатива через раздельные env-переменные для CI/CD
  return {
    host: process.env.DICTIONARY_DB_HOST ?? 'localhost',
    port: Number(process.env.DICTIONARY_DB_PORT ?? 5432),
    database: process.env.DICTIONARY_DB_NAME ?? 'dictionary',
    user: process.env.DICTIONARY_DB_USER ?? 'user',
    password: process.env.DICTIONARY_DB_PASSWORD ?? 'password',
    ssl:
      process.env.DICTIONARY_DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
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

    for (let attempt = 1; ; attempt += 1) {
      logger.log(`Подключение к Postgres. Попытка: ${attempt}`);

      const pool = new Pool(config);
      pool.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Ошибка пула Postgres: ${message}`);
      });

      try {
        await ensurePoolConnected(pool);
        logger.log(`Подключение к Postgres успешно. Попыток: ${attempt}`);
        return pool;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Не удалось подключиться к Postgres (попытка ${attempt}): ${message}`);
        await pool.end().catch(() => undefined);
      }

      await wait(5000);
    }
  },
};

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (pool: Pool) => drizzle(pool, { schema }),
  inject: [PG_POOL],
};
