// snowfall.ts
// Снег: 20 секунд каждые 5 минут.
// Плавное нарастание в начале, плавное убывание в конце.
// Снежинки исчезают внизу экрана.

import { SnowfallEngine } from './snow-engine';

export interface SnowfallOptions {
  flakeCount?: number;
  showDurationMs?: number;
  periodMs?: number;
  /** Цвет снежинок (любой валидный CSS-цвет) */
  flakeColor?: string;
  /** Функция для проверки, нужно ли отключить снежинки */
  shouldDisable?: () => boolean;
}

export interface SnowfallController {
  /** Остановить снежинки */
  stop: () => void;
  /** Возобновить снежинки */
  resume: () => void;
  /** Проверить, работают ли снежинки */
  isRunning: () => boolean;
  /** Полностью уничтожить снежинки (удалить из DOM) */
  destroy: () => void;
}

export function setupSnowfall(options: SnowfallOptions = {}): SnowfallController {
  // Делегируем создание и управление снегом в класс SnowfallEngine, использующий RxJS.
  const engineController = SnowfallEngine.setup({
    flakeCount: options.flakeCount,
    showDurationMs: options.showDurationMs,
    periodMs: options.periodMs,
    flakeColor: options.flakeColor,
    shouldDisable: options.shouldDisable,
  });

  return {
    stop: () => engineController.stop(),
    resume: () => engineController.resume(),
    isRunning: () => engineController.isRunning(),
    destroy: () => engineController.destroy(),
  };
}
