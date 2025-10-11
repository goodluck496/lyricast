import { EventEmitter } from 'node:events';
import { BaseHttpWorkerManager, WorkerSpec } from './base-worker-manager';

/**
 * Реестр воркеров:
 *  - создаёт менеджеры
 *  - пробрасывает события наверх ('worker:ready' и т.д.)
 *  - даёт get(name) / list()
 *  - умеет ждать готовности всех
 */
export class WorkersRegistry extends EventEmitter {
  private map = new Map<string, BaseHttpWorkerManager>();

  constructor(specs: WorkerSpec[]) {
    super();

    specs.forEach((s) => {
      const m = new BaseHttpWorkerManager(s);
      this.map.set(s.name, m);

      // пробрасываем события с именем воркера
      m.on('ready', (e) => this.emit('worker:ready', e));
      m.on('reready', (e) => this.emit('worker:reready', e));
      m.on('exit', (e) => this.emit('worker:exit', e));
      m.on('error', (e) => this.emit('worker:error', e));
    });
  }

  get(name: string) {
    const m = this.map.get(name);
    if (!m) throw new Error(`Worker "${name}" not found`);
    return m;
  }

  list() {
    return [...this.map.keys()];
  }

  /** Ждём готовности всех воркеров (по-умолчанию 5с на каждого) */
  async waitAllReady(timeoutPerWorker = 5000) {
    await Promise.all(
      [...this.map.values()].map((m) => m.waitReady(timeoutPerWorker))
    );
  }

  /** Корректно завершаем всех */
  disposeAll() {
    for (const m of this.map.values()) m.dispose();
  }
}
