import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function runMigrations(dbPath: string) {
  const sqlite = new Database(dbPath);
  console.log('run migrate for assets', dbPath);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: 'drizzle/asset' }); // a new folder for asset migrations
  return db;
}
