// apps/electron/src/main/file-worker.pool.ts
import { app } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { Piscina } from 'piscina';

function resolveWorkerJs(name: string) {
  if (!app.isPackaged) {
    return path.join(
      __dirname,
      '..',
      '..',
      'apps',
      'electron',
      'workers',
      name
    );
  }
  // prod: воркеры лежат ВНУТРИ app.asar: dist/apps/electron/workers/*.js
  return path.join(__dirname, 'workers', name);
}

/**
 * @deprecated удалить пул воркеров если будет хватать app'ов в apps/workers
 */
export class FileWorkerPool {
  public assetsDir = '';
  dbPool: Piscina;
  private pool: Piscina;

  constructor(opts?: { threads?: number }) {
    console.log('init pool');

    const resolvedWorkerPath = resolveWorkerJs('db.worker.js');

    this.assetsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'electron-assets')
      : path.join(__dirname, 'assets');

    const dbFile = app.isPackaged
      ? path.join(process.resourcesPath, 'electron-assets', 'RST.SQLite3')
      : path.join(__dirname, 'assets', 'RST.SQLite3');

    const threads =
      opts?.threads ??
      Math.max(2, Math.min(4, os.availableParallelism?.() ?? 4));
    this.pool = new Piscina({
      filename: resolveWorkerJs('bible.worker.js'),
      minThreads: threads,
      maxThreads: threads,
      idleTimeout: Infinity, // держим воркеры живыми
      // concurrentTasksPerWorker: 1 — оставим по умолчанию, I/O внутри воркера и так async
    });

    this.dbPool = new Piscina({
      filename: resolvedWorkerPath,
      minThreads: 1,
      maxThreads: 1,
      idleTimeout: Infinity,
    });

    this.dbPool.run({ type: 'init', dbPath: dbFile });

    setTimeout(() => {
      this.dbPool
        .run({ type: 'get:books' })
        .then((r) => console.log('result', r.length));
    }, 2000);
  }

  // универсальный «HTTP-like» вызов
  request<T = any>(action: any): Promise<T> {
    return this.pool.run(
      { ...action, assetsDir: this.assetsDir },
      { name: 'getTranslate' }
    ); // { action: '...', payload: {...} }
  }
}
