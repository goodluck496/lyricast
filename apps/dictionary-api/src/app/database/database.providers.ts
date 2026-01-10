import { Provider } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../lib/db/schema';

export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');

function buildPoolConfig(): PoolConfig {
  const url = process.env.DICTIONARY_DB_URL;
  if (url && url.trim() !== '') {
    return { connectionString: url };
  }

  // Альтернатива через раздельные env-переменные для CI/CD
  return {
    host: process.env.DICTIONARY_DB_HOST ?? 'localhost',
    port: Number(process.env.DICTIONARY_DB_PORT ?? 5432),
    database: process.env.DICTIONARY_DB_NAME ?? 'dictionary',
    user: process.env.DICTIONARY_DB_USER ?? 'user',
    password: process.env.DICTIONARY_DB_PASSWORD ?? 'password',
    ssl: process.env.DICTIONARY_DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

export const pgPoolProvider: Provider = {
  provide: PG_POOL,
  useFactory: () => {
    const config = buildPoolConfig();
    return new Pool(config.connectionString ? { connectionString: config.connectionString } : config);
  },
};

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (pool: Pool) => drizzle(pool, { schema }),
  inject: [PG_POOL],
};
