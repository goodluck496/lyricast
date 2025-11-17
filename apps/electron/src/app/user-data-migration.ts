import fs from 'fs';
import path from 'path';
import { getUserAssetsDir, getUserDatabasesDir } from './paths';

/**
 * Служебная функция для копирования содержимого каталога `src` в `dest`,
 * но только если в целевой директории ещё НЕТ данных.
 *
 * Используется для one-time миграции из старого расположения (resources)
 * в новое (userData), чтобы не перезаписывать уже созданные пользователем файлы.
 */
function copyDirIfDestEmpty(src: string, dest: string) {
  if (!fs.existsSync(src)) {
    // Старой директории нет — мигрировать нечего.
    return;
  }

  if (fs.existsSync(dest)) {
    const hasFiles = fs.readdirSync(dest).length > 0;
    if (hasFiles) {
      // В новом месте уже есть данные — считаем, что пользователь работал в новой схеме.
      // Ничего не трогаем, чтобы не перезатирать актуальные файлы.
      return;
    }
  } else {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirIfDestEmpty(srcPath, destPath);
    } else if (entry.isFile()) {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

/**
 * Переносит старую папку user-assets из ресурсов:
 *   <resources>/assets/user-assets
 * в новое место в userData:
 *   <userData>/lyricast/user-assets
 *
 * Копирование происходит только если в новом месте ещё нет файлов.
 */
export async function migrateOldUserAssetsToUserData() {
  const oldAssetsDir = path.join(process.resourcesPath, 'assets', 'user-assets');
  const newAssetsDir = getUserAssetsDir();

  copyDirIfDestEmpty(oldAssetsDir, newAssetsDir);
}

/**
 * Переносит старые БД из ресурсов:
 *   <resources>/assets/databases
 * в новое место в userData:
 *   <userData>/lyricast/databases
 *
 * Также копирует только при отсутствии данных в новой директории.
 */
export async function migrateOldDatabasesToUserData() {
  const oldDbDir = path.join(process.resourcesPath, 'assets', 'databases');
  const newDbDir = getUserDatabasesDir();

  copyDirIfDestEmpty(oldDbDir, newDbDir);
}

/**
 * Комплексная миграция пользовательских данных из старых путей в новые.
 *
 * Вызывается один раз при старте приложения (App.onReady), ПЕРЕД запуском миграций БД.
 * Основной сценарий:
 *   - пользователь обновился со старой версии, где данные лежали в resources;
 *   - мы копируем их в userData, чтобы следующие обновления приложения их не затирали.
 */
export async function migrateUserDataFromOldLocations() {
  try {
    await migrateOldUserAssetsToUserData();
    await migrateOldDatabasesToUserData();
  } catch (e) {
    // Лог ошибки оставляем на уровне вызова, чтобы не заваливать старт приложения.
    // Основной кейс — просто отсутствие старых директорий.
    console.error('[UserDataMigration] Error while migrating user data', e);
  }
}
