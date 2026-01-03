import type { WorkerSpec } from '@lyri-cast/worker-kit';

// Единая типизированная точка регистрации всех backend-воркеров приложения.
export const WORKER_SPECS = [
  {
    name: 'songs',
    rootApiPath: 'songs',
    distSubdir: 'songs-service',
  },
  {
    name: 'bible',
    rootApiPath: 'bible',
    distSubdir: 'bible-service',
  },
  {
    name: 'free-slide',
    rootApiPath: 'free-slide',
    distSubdir: 'free-slide-service',
  },
  {
    name: 'assets',
    rootApiPath: 'assets',
    distSubdir: 'asset-service',
  },
  {
    name: 'quiz',
    rootApiPath: 'quiz',
    distSubdir: 'quiz-service',
  },
] satisfies ReadonlyArray<WorkerSpec>;

export type WorkerName = (typeof WORKER_SPECS)[number]['name'];
