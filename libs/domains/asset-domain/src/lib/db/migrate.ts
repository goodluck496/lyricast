import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function runMigrations(dbPath: string) {
  const sqlite = new Database(dbPath);
  console.log(`[MIGRATE][asset] Running migrations for db at: ${dbPath}`);
  const db = drizzle(sqlite);
  try {
    migrate(db, { migrationsFolder: 'drizzle/asset' }); // a new folder for asset migrations
    console.log('[MIGRATE][asset] Migrations applied successfully.');
  } catch (error) {
    console.error('[MIGRATE][asset] Error applying migrations:', error);
  }
  return db;
}
