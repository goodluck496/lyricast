import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as path from 'path';

export function runMigrations(sqlite: Database.Database) {
  console.log(`[MIGRATE][free-slide] Running migrations...`);
  const db = drizzle(sqlite);
  try {
    const migrationsFolder = path.join(
      process.env.SOURCE_DATA_PATH,
      'drizzle',
      'free-slide'
    );
    migrate(db, { migrationsFolder });
    console.log('[MIGRATE][free-slide] Migrations applied successfully.');
  } catch (error) {
    console.error('[MIGRATE][free-slide] Error applying migrations:', error);
  }
}
