import type { Config } from 'drizzle-kit';

export default {
  schema: './libs/domains/asset-domain/src/lib/db/schema.ts',
  out: './drizzle/asset',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/assets.sqlite',
  },
} satisfies Config;
