import { getDbPath } from '@lyri-cast/common-workers';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'path';
import * as process from 'node:process';
import * as fs from 'fs';

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

      // Совместимость со старыми версиями free-slide.sqlite:
      // если таблицы presentations нет (старый формат БД),
      // пробуем заменить файл на шаблон из assets/databases, а затем запустить миграции.
      if (config.dbName === 'free-slide.sqlite') {
        try {
          const checkDb = new Database(dbPath);
          const tables = checkDb
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='presentations';"
            )
            .all();
          checkDb.close();

          if (!tables || tables.length === 0) {
            const sourceRoot = process.env.SOURCE_DATA_PATH;
            if (sourceRoot) {
              const seededDbPath = join(
                sourceRoot,
                'assets',
                'databases',
                config.dbName
              );

              if (fs.existsSync(seededDbPath)) {
                fs.copyFileSync(seededDbPath, dbPath);
                console.log(
                  `[MIGRATIONS][${config.dbName}] Replaced legacy DB with seeded template due to missing presentations table.`
                );
              }
            }
          }
        } catch (compatError) {
          console.error(
            `[MIGRATIONS][${config.dbName}] Compatibility check failed`,
            compatError
          );
        }
      }

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
