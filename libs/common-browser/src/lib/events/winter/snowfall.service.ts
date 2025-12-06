import { Injectable } from '@angular/core';
import { Pages } from '../../pages.types';
import { setupSnowfall, SnowfallController } from './snow';

const STORAGE_KEY = 'lyricast.snow';

@Injectable({ providedIn: 'root' })
export class SnowfallManager {
  private controller: SnowfallController | null = null;
  private enabled = false;

  constructor() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'on') {
        this.enabled = true;
      }
    } catch {
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
    } catch {
      // ignore
    }

    if (!value) {
      // При выключении сразу останавливаем, если контроллер уже есть
      this.controller?.stop();
      return;
    }

    // При включении гарантируем запуск снега
    this.ensureRunning();
  }

  ensureRunning(): void {
    if (!this.enabled) {
      return;
    }

    if (!this.controller) {
      this.controller = setupSnowfall({
        flakeCount: 60,
        showDurationMs: 30_000,
        // дополнительная пауза перед следующей сессией
        periodMs: 5_000,
        flakeColor: '#ddeeff',
        shouldDisable: () => {
          if (!this.enabled) {
            return true;
          }

          if (typeof window === 'undefined') {
            return true;
          }

          const href = window.location.href;

          // Не показываем снег на кастинге Библии и free-slide
          const isBibleCasting =
            href.includes(Pages.BIBLE_FEATURE) && href.includes(Pages.CASTING);
          const isFreeSlideCasting =
            href.includes(Pages.FREE_SLIDE_FEATURE) &&
            href.includes(Pages.CASTING);

          return isBibleCasting || isFreeSlideCasting;
        },
      });
      return;
    }

    if (!this.controller.isRunning()) {
      this.controller.resume();
    }
  }

  stop(): void {
    this.controller?.stop();
  }
}
