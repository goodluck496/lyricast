import { getDbPath } from '@lyri-cast/common-workers';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'path';
import * as process from 'node:process';

export async function runDatabaseMigrations() {
  console.log('[MIGRATIONS] Starting database migration check...');
  const dbConfigs = [
    {
      dbName: 'assets.sqlite',
      migrationsFolder: 'asset',
    },
    {
      dbName: 'free-slide.sqlite',
      migrationsFolder: 'free-slide',
    },
  ];

  for (const config of dbConfigs) {
    let sqlite: Database.Database | null = null;
    try {
      const { dbPath } = getDbPath({
        dbName: config.dbName,
        copyFromSourceInProd: true,
      });

      const migrationsPath = join(
        process.env.SOURCE_DATA_PATH,
        'drizzle',
        config.migrationsFolder
      );

      console.log(`[MIGRATIONS][${config.dbName}] DB path: ${dbPath}`);
      console.log(
        `[MIGRATIONS][${config.dbName}] Migrations folder: ${migrationsPath}`
      );

      sqlite = new Database(dbPath);
      const db: BetterSQLite3Database = drizzle(sqlite);

      migrate(db, { migrationsFolder: migrationsPath });

      console.log(
        `[MIGRATIONS][${config.dbName}] Migration check completed successfully.`
      );
    } catch (e) {
      console.error(
        `[MIGRATIONS][${config.dbName}] Error during migration:`,
        e
      );
    } finally {
      if (sqlite?.open) {
        sqlite.close();
      }
    }
  }
  console.log('[MIGRATIONS] Database migration check finished.');
}
