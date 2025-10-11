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

  // В prod путь идёт ВНУТРЬ app.asar
  // Важно: Node/Worker умеют загружать файлы из asar напрямую.
  const appRoot = app.getAppPath();
  return path.join(
    appRoot,
    'dist',
    'apps',
    'electron',
    'workers',
    distSubdir,
    entry
  );
}
export function resolveWorkersAssets() {
  const isDev = !app.isPackaged;

  if (isDev) {
    return path.join(process.cwd(), 'assets');
  }

  return path.resolve(app.getAppPath(), '..', 'assets');
}
