import { app } from 'electron';
import { join } from 'path';

/**
 * Утилитарная функция, чтобы централизованно узнавать,
 * запущено ли приложение в упакованном виде (electron-builder) или в dev-режиме.
 *
 * Нужна в тех случаях, когда логика путей/ресурсов зависит от режима.
 */
export function isAppPackaged(): boolean {
  return app.isPackaged;
}

/**
 * Базовый путь к «SOURCE» данным приложения.
 *
 * dev  -> корень проекта (process.cwd()), чтобы находить папки вроде `data`, `drizzle` и т.п.
 * prod -> process.resourcesPath, куда electron-builder складывает extraResources.
 */
export function getSourceDataPath(): string {
  return app.isPackaged ? process.resourcesPath : process.cwd();
}

/**
 * Корень пользовательских данных для LyriCast.
 *
 * Используем стандартный electron-путь userData и добавляем вложенную папку `lyricast`,
 * чтобы изолировать файлы приложения от других программ.
 *
 * Пример (Windows):
 *   C:\\Users\\USER\\AppData\\Roaming\\LyriCast\\lyricast
 */
export function getUserDataRoot(): string {
  const base = app.getPath('userData');
  return join(base, app.getName());
}

/**
 * Директория, где будут лежать ВСЕ живые БД (sqlite-файлы),
 * которые изменяются во время работы приложения.
 */
export function getUserDatabasesDir(): string {
  return join(getUserDataRoot(), 'databases');
}

/**
 * Директория для пользовательских ассетов (user-assets):
 * файлы свободных слайдов, загруженные картинки и т.п.
 *
 * Важно: эта папка всегда находится в userData и не попадает под перезапись при обновлениях.
 */
export function getUserAssetsDir(): string {
  return join(getUserDataRoot(), 'user-assets');
}

/**
 * Централизованная инициализация переменных окружения, связанных с путями.
 *
 * Эти переменные читают воркеры и общие helper’ы (например, getDbPath):
 *   - IS_PACKAGED      — флаг "dev/prod";
 *   - SOURCE_DATA_PATH — корень ресурсов приложения (drizzle, сид-данные и т.п.);
 *   - USER_DATA_PATH   — корень пользовательских данных LyriCast;
 *   - USER_ASSETS_PATH — директория для user-assets.
 */
export function configureAppPathsEnv(): void {
  process.env.IS_PACKAGED = String(app.isPackaged);
  process.env.SOURCE_DATA_PATH = getSourceDataPath();
  process.env.USER_DATA_PATH = getUserDataRoot();
  process.env.USER_ASSETS_PATH = getUserAssetsDir();
}
