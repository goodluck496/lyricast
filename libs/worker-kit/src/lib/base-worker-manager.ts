// apps/electron/src/app/base-worker-manager.ts
import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';
import { app } from 'electron';
import { resolveWorkerEntry, resolveWorkersAssets } from './worker-path';
import path from 'node:path';
import * as fs from 'node:fs';

type BootMsg =
  | { t: 'ready'; port: number }
  | { t: 'error'; error: string; stack?: string }
  | { t: 'dispose' };

export interface WorkerSpec {
  /**
   * Имя воркера (для логов/реестра)
   */
  name: string; // 'bible' | 'songs' | 'freeslide' | ...
  /**
   * относительный путь в контроллере
   */
  rootApiPath: string;
  /** Папка дистрибутива в dist/apps */
  distSubdir: string; // 'bible-worker' и т.п.
  /** Имя entry-файла (по умолчанию main.js) */
  entry?: string; // 'main.js'
  /** Включить авто-релоад при изменении entry в dev-режиме */
  devWatch?: boolean;
  /** Таймаут ожидания готовности (ms) при старте/перезапуске */
  readyTimeoutMs?: number; // по умолчанию 7000
}

/**
 * Менеджер одного HTTP-воркера (Nest внутри worker_threads):
 *  - спавнит воркер
 *  - ждёт 'ready' (порт)
 *  - отдаёт baseUrl
 *  - в dev следит за entry-файлом и мягко перезапускает воркер
 *  - эмитит события: 'ready' | 'reready' | 'exit' | 'error'
 */
export class BaseHttpWorkerManager extends EventEmitter {
  private worker!: Worker;
  private port?: number;

  private readonly entryPath: string;
  private readonly readyTimeoutMs: number;
  private watcher?: chokidar.FSWatcher | EventEmitter;
  private reloading = false;

  // промис «готовности»
  private readyDeferred?: { p: Promise<void>; resolve: () => void };

  constructor(public readonly spec: WorkerSpec) {
    super();

    this.entryPath = this.resolveEntry(spec);
    this.readyTimeoutMs = spec.readyTimeoutMs ?? 7000;

    function dumpAsarWorkers() {
      const root = app.getAppPath(); // корень app.asar
      const dir = path.join(root, 'workers');
      try {
        const files = fs
          .readdirSync(dir, { withFileTypes: true })
          .map((d) => (d.isDirectory() ? d.name + '/' : d.name));
        console.log('[asar workers]', dir, '->', files);
      } catch (e) {
        console.log('[asar workers] not found at', dir, e);
      }
    }
    // check asar workers проверить все ли воркеры есть в asar файле
    // dumpAsarWorkers();

    // первый запуск
    this.makeReadyDeferred();
    this.worker = this.spawn(this.entryPath);
    console.log(`[worker:running][${this.spec.name}]`, this.entryPath);

    // авто-релоад в dev по изменению собранного файла воркера
    if (!app.isPackaged && spec.devWatch) {
      const chokidar = require('chokidar');
      this.watcher = chokidar
        .watch(this.entryPath, {
          ignoreInitial: true,
          awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
          depth: 0,
        })
        .on('change', () => {
          console.log(
            `[worker:rebuild][${this.spec.name}] - ${new Date().toISOString()}`
          );
          this.reload().catch((err) => this.emit('error', err));
        });
    }
  }

  /** Мягкий перезапуск воркера (используется хот-релоад в dev) */
  async reload(): Promise<void> {
    if (this.reloading) return;
    this.reloading = true;

    try {
      // создаём новую «ожидалку» готовности под новый инстанс
      this.makeReadyDeferred();
      const next = this.spawn(this.entryPath);

      // ждём 'ready' или таймаут
      await Promise.race([
        this.readyDeferred!.p,
        new Promise<void>((_, rej) =>
          setTimeout(
            () => rej(new Error(`${this.spec.name} reload timeout`)),
            this.readyTimeoutMs
          )
        ),
      ]);

      // переключаемся: новый стал основным
      const old = this.worker;
      this.worker = next;

      // мягко закрываем старый воркер
      old.postMessage({ t: 'dispose' } satisfies BootMsg);

      // уведомляем о «вторичной» готовности
      if (this.listenerCount('reready') > 0) {
        this.emit('reready', { name: this.spec.name, port: this.port! });
      }
    } finally {
      this.reloading = false;
    }
  }

  /** Ждём первичной готовности (или повторной — после makeReadyDeferred) */
  async waitReady(timeoutMs = this.readyTimeoutMs): Promise<void> {
    if (this.port) return; // уже готов
    const p = this.readyDeferred?.p ?? Promise.resolve();
    if (timeoutMs <= 0) {
      await p;
      return;
    }
    await Promise.race([
      p,
      new Promise<void>((_, rej) =>
        setTimeout(
          () => rej(new Error(`${this.spec.name} waitReady timeout`)),
          timeoutMs
        )
      ),
    ]);
  }

  isReady() {
    return Number.isInteger(this.port);
  }

  /** Базовый URL воркера (http://127.0.0.1:<port>) */
  getBaseUrl() {
    if (!this.port) throw new Error(`${this.spec.name} worker not ready`);
    return `http://127.0.0.1:${this.port}`;
  }

  /** Корректное завершение воркера и вотчера */
  dispose() {
    //@ts-ignore
    this.watcher?.close().catch(() => {});
    try {
      this.worker.postMessage({ t: 'dispose' } satisfies BootMsg);
    } catch {
      // ignore
    }
  }

  /** Абсолютный путь к entry в dev/prod */
  private resolveEntry(spec: WorkerSpec) {
    const entry = spec.entry ?? 'main.js';
    return resolveWorkerEntry(spec.distSubdir, entry);
  }

  /** Создаём новый «деферред» для ожидания готовности */
  private makeReadyDeferred() {
    let resolve!: () => void;
    const p = new Promise<void>((res) => (resolve = res));
    this.readyDeferred = { p, resolve };
  }

  /** Старт воркера и подписки на события */
  private spawn(entryAbsPath: string) {
    const w = new Worker(entryAbsPath, {
      env: {
        ...process.env,
        isProd: String(app.isPackaged),
        assetsPath: resolveWorkersAssets(),
      },
    });
    let oldPort = 0;
    w.on('message', (m: BootMsg) => {
      if (m?.t === 'ready') {
        this.port = m.port;
        oldPort = m.port;
        // закрываем «ожидалку» готовности
        this.readyDeferred?.resolve();
        if (this.listenerCount('ready') > 0) {
          this.emit('ready', { name: this.spec.name, port: m.port });
        }
      } else if (m?.t === 'error') {
        this.emit('error', new Error(`[${this.spec.name}] ${m.error}`));
      }
    });

    w.on('error', (e) => this.emit('error', e));
    w.on('exit', (code) =>
      this.emit('exit', { name: this.spec.name, code, port: oldPort })
    );

    return w;
  }
}
