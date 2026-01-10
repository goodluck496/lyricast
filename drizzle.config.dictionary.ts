import type { Config } from 'drizzle-kit';

export default {
  schema: './apps/dictionary-api/src/lib/db/schema.ts',
  out: './drizzle/dictionary',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DICTIONARY_DB_URL
  },
} satisfies Config;
