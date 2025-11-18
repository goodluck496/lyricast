import * as path from 'node:path';
import { app } from 'electron';

export function resolveWorkerEntry(distSubdir: string, entry = 'main.js') {
  const isDev = !app.isPackaged;

  // В dev запускаем из project root/dist
  if (isDev) {
    return path.join(
      process.cwd(),
      'dist',
      'apps',
      'workers',
      distSubdir,
      entry
    );
  }

  // В prod путь идёт ВНУТРЬ app.asar, в ту же структуру, что и в dev (dist/apps/workers/...)
  // Важно: Node/Worker умеют загружать файлы из asar напрямую.
  const appRoot = app.getAppPath(); // .../resources/app.asar
  const workerDir = path.join(appRoot, 'dist', 'apps', 'workers', distSubdir);
  const workerPath = path.join(workerDir, entry);

  try {
    require('fs').readdirSync(workerDir);
  } catch (e) {
    console.log('[worker-path][prod] failed to list workerDir', {
      appRoot,
      distSubdir,
      workerDir,
      workerPath,
      error: String(e),
    });
  }

  return workerPath;
}

export function resolveWorkersAssets() {
  // Основной источник правды о путях — SOURCE_DATA_PATH, который
  // настраивается в apps/electron/src/app/paths.ts → configureAppPathsEnv.
  const fromEnv = process.env.SOURCE_DATA_PATH;

  if (fromEnv && fromEnv.length > 0) {
    return path.join(fromEnv, 'assets');
  }

  // Fallback на случай, если configureAppPathsEnv не вызван (тесты/нестандартный запуск)
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(process.cwd(), 'assets');
  }

  return path.resolve(app.getAppPath(), '..', 'assets');
}
