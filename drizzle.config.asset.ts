import type { Config } from 'drizzle-kit';

export default {
  schema: './libs/domains/asset-domain/src/lib/db/schema.ts',
  out: './drizzle/asset',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.ASSET_DB_PATH
      ? `file:///${process.env.ASSET_DB_PATH.replace(/\\/g, '/')}`
      : 'file:./data/assets.sqlite',
  },
} satisfies Config;
