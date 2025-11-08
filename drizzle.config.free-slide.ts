import type { Config } from 'drizzle-kit';

export default {
  schema: './libs/domains/free-slide-domain/src/lib/db/schema.ts',
  out: './drizzle/free-slide',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/free-slides.sqlite',
  },
} satisfies Config;
