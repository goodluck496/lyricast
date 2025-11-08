import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function runMigrations(dbPath: string) {
  const sqlite = new Database(dbPath);
  console.log(`[MIGRATE][free-slide] Running migrations for db at: ${dbPath}`);
  const db = drizzle(sqlite);
  try {
    migrate(db, { migrationsFolder: 'drizzle/free-slide' });
    console.log('[MIGRATE][free-slide] Migrations applied successfully.');
  } catch (error) {
    console.error('[MIGRATE][free-slide] Error applying migrations:', error);
  }
  return db;
}
