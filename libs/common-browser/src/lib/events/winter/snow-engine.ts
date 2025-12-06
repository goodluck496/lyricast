import { fromEvent, interval, merge, Subscription, timer } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

export interface SnowfallEngineOptions {
  flakeCount: number;
  showDurationMs: number;
  periodMs: number;
  flakeColor: string;
  shouldDisable?: () => boolean;
}

export interface SnowfallEngineController {
  stop(): void;
  resume(): void;
  isRunning(): boolean;
  destroy(): void;
}

/**
 * Класс-движок для анимации снега на странице.
 * Использует RxJS для таймеров и подписок.
 */
export class SnowfallEngine implements SnowfallEngineController {
  private static instance: SnowfallEngine | null = null;

  static setup(options: Partial<SnowfallEngineOptions> = {}): SnowfallEngineController {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return {
        stop: () => {},
        resume: () => {},
        isRunning: () => false,
        destroy: () => {},
      };
    }

    if (SnowfallEngine.instance) {
      return SnowfallEngine.instance;
    }

    const {
      flakeCount = 60,
      showDurationMs = 20_000,
      periodMs = 5 * 60_000,
      flakeColor = '#ffffff',
      shouldDisable,
    } = options;

    const containerId = 'vkb-snowfall-container';
    const styleId = 'vkb-snowfall-style';

    const container = SnowfallEngine.ensureContainer(containerId);
    if (!container) {
      return {
        stop: () => {},
        resume: () => {},
        isRunning: () => false,
        destroy: () => {},
      };
    }

    SnowfallEngine.ensureStyles(styleId);
    container.style.setProperty('--flake-color', flakeColor);

    const engine = new SnowfallEngine(container, {
      flakeCount,
      showDurationMs,
      periodMs,
      flakeColor,
      shouldDisable,
    });

    SnowfallEngine.instance = engine;
    return engine;
  }

  private running = false;

  private thinningSub?: Subscription;
  private showEndSub?: Subscription;
  private nextSessionSub?: Subscription;
  private routeSub?: Subscription;

  private constructor(
    private readonly container: HTMLDivElement,
    private readonly options: SnowfallEngineOptions,
  ) {
    this.setupRouteListener();
    this.startSession();
  }

  stop(): void {
    this.running = false;
    this.thinningSub?.unsubscribe();
    this.showEndSub?.unsubscribe();
    this.nextSessionSub?.unsubscribe();
    this.container.classList.remove('snow--active');
  }

  resume(): void {
    if (!this.running) {
      this.startSession();
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  destroy(): void {
    this.stop();
    this.routeSub?.unsubscribe();
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    SnowfallEngine.instance = null;
  }

  // --- Приватные методы ---

  private startSession(): void {
    if (this.options.shouldDisable && this.options.shouldDisable()) {
      return;
    }

    if (this.running) return;
    this.running = true;

    // Перед каждым новым сеансом пересоздаём снежинки, чтобы CSS-анимации перезапустились.
    this.container.innerHTML = '';
    SnowfallEngine.createFlakes(this.container, this.options.flakeCount);

    this.container.classList.add('snow--active');

    const startTime = performance.now();
    const THIN_INTERVAL_MS = 200;

    this.thinningSub?.unsubscribe();
    this.thinningSub = interval(THIN_INTERVAL_MS).subscribe(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / this.options.showDurationMs);

      if (progress >= 1) {
        this.beginSettleAndStop(startTime);
        this.thinningSub?.unsubscribe();
        return;
      }

      // Пока для класса оставляем простую версию: показываем все снежинки сразу
      const flakes = this.container.querySelectorAll<HTMLElement>('.snow__flake');
      flakes.forEach(f => f.classList.remove('snow__flake--hidden'));
    });

    this.showEndSub?.unsubscribe();
    this.showEndSub = timer(this.options.showDurationMs).subscribe(() => {
      if (this.running) {
        this.beginSettleAndStop(startTime);
      }
    });
  }

  private beginSettleAndStop(sessionStartTimeMs: number): void {
    if (!this.running) return;

    this.running = false;
    this.thinningSub?.unsubscribe();
    this.showEndSub?.unsubscribe();

    const flakes = Array.from(this.container.querySelectorAll<HTMLElement>('.snow__flake'));

    // Оцениваем максимальное время жизни снежинок (delay + duration)
    const now = performance.now();
    const elapsedSec = (now - sessionStartTimeMs) / 1000;
    let maxRemainingSec = 0;

    flakes.forEach(flake => {
      const duration = parseFloat(flake.style.getPropertyValue('--duration') || '15');
      const delay = parseFloat(flake.style.getPropertyValue('--delay') || '0');
      const total = delay + duration;
      const remaining = total - elapsedSec;
      if (remaining > maxRemainingSec) {
        maxRemainingSec = remaining;
      }
    });

    const bufferMs = 400;
    const waitMs = maxRemainingSec > 0 ? maxRemainingSec * 1000 + bufferMs : bufferMs;

    this.nextSessionSub?.unsubscribe();
    this.nextSessionSub = timer(waitMs).subscribe(() => {
      this.container.classList.remove('snow--active');
      // Планируем следующую сессию через period
      this.nextSessionSub?.unsubscribe();
      this.nextSessionSub = timer(this.options.periodMs).subscribe(() => this.startSession());
    });
  }

  private setupRouteListener(): void {
    if (!this.options.shouldDisable) return;

    const url$ = merge(
      interval(500),
      fromEvent(window, 'popstate'),
      fromEvent(window, 'hashchange'),
    ).pipe(
      map(() => window.location.href),
      distinctUntilChanged(),
    );

    this.routeSub?.unsubscribe();
    this.routeSub = url$.subscribe(() => {
      const disabled = this.options.shouldDisable?.() ?? false;
      if (disabled && this.isRunning()) {
        this.stop();
      } else if (!disabled && !this.isRunning()) {
        this.resume();
      }
    });
  }

  // --- Статические утилиты (локальные копии, чтобы не трогать исходный файл) ---

  private static ensureStyles(styleId: string): void {
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (styleEl) return;

    styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.type = 'text/css';
    // Здесь можно переиспользовать тот же CSS, что и в snow.ts, либо упростить
    styleEl.textContent = `
  .snow {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 2147483647; /* поверх всего */
    opacity: 0;
    transition: opacity 0.4s ease;
    /* Создаём новый stacking context для изоляции от скролла */
    transform: translateZ(0);
    backface-visibility: hidden;
  }

  .snow--active {
    opacity: 1;
  }

  .snow__flake {
    position: absolute;
    top: -10vh;
    left: 0;

    /* Вертикальное падение: один раз, затем остаётся в финальном состоянии */
    animation: snow-fall var(--duration, 10s) linear forwards;
    animation-delay: var(--delay, 0s);
    will-change: transform, opacity;

    /* плавное появление/исчезновение при редении */
    transition: opacity 0.3s ease-out;
  }

  /* Плавное исчезновение по достижении 80% высоты экрана в фазе оседания */
  .snow__flake--fading {
    opacity: 0;
  }

  /* Внутренний элемент для горизонтального покачивания */
  .snow__flake-inner {
    color: var(--flake-color, #ffffff);
    font-size: var(--size, 18px);
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.25);

    display: inline-flex;
    align-items: center;
    justify-content: center;

    /* Комбинированная анимация: покачивание + вращение */
    animation: snow-sway-rotate var(--sway-duration, 4s) ease-in-out infinite;
    animation-delay: var(--sway-delay, 0s);
    will-change: transform;
  }

  /* "Спрятанные" снежинки – редим поток без дёрганья */
  .snow__flake--hidden {
    opacity: 0;
  }

  /* Жизненный цикл снежинки:
     1) Старт чуть выше экрана (-5vh), невидима
     2) Появляется и летит от 0vh до ~80vh, остаётся видимой
     3) Между 80% и 100% пути плавно исчезает, к 100vh opacity = 0 */
  @keyframes snow-fall {
    0% {
      transform: translateY(calc(-5vh + var(--y-jitter, 0vh)));
      opacity: 0;
    }
    5% {
      opacity: 0.9;
    }
    80% {
      transform: translateY(calc(80vh + var(--y-jitter, 0vh)));
      opacity: 0.9;
    }
    100% {
      transform: translateY(calc(110vh + var(--y-jitter, 0vh)));
      opacity: 0;
    }
  }

  /* Комбинированная анимация: покачивание + вращение */
  @keyframes snow-sway-rotate {
    0% {
      transform: translateX(0) rotate(0deg);
    }
    25% {
      transform: translateX(var(--x1, 50px)) rotate(var(--r1, 90deg));
    }
    50% {
      transform: translateX(0) rotate(var(--r2, 180deg));
    }
    75% {
      transform: translateX(var(--x2, -50px)) rotate(var(--r3, 270deg));
    }
    100% {
      transform: translateX(0) rotate(var(--r4, 360deg));
    }
  }
`;
    document.head.appendChild(styleEl);
  }

  private static ensureContainer(containerId: string): HTMLDivElement | null {
    let container = document.getElementById(containerId) as HTMLDivElement | null;
    if (container) return container;

    const body = document.body;
    if (!body) return null;

    container = document.createElement('div');
    container.id = containerId;
    container.className = 'snow';
    body.appendChild(container);
    return container;
  }

  private static createFlakes(container: HTMLDivElement, count: number): void {
    // В этой версии класса создаём структуру снежинок аналогично реализации в snow.ts
    const fragment = document.createDocumentFragment();
    const glyphs = ['❆', '❄', '✻', '✼'];

    for (let i = 0; i < count; i++) {
      const flake = document.createElement('span');
      flake.className = 'snow__flake';

      const inner = document.createElement('span');
      inner.className = 'snow__flake-inner';
      const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
      inner.textContent = glyph;
      flake.appendChild(inner);

      const left = Math.random() * 100; // vw
      flake.style.left = `${left}vw`;

      const yJitter = (Math.random() * 4 - 2); // от -2vh до +2vh
      flake.style.setProperty('--y-jitter', `${yJitter}vh`);

      const size = 14 + Math.random() * 12;
      flake.style.setProperty('--size', `${size}px`);

      const duration = 11 + Math.random() * 10;
      flake.style.setProperty('--duration', `${duration}s`);

      const swayDuration = 4 + Math.random() * 3;
      flake.style.setProperty('--sway-duration', `${swayDuration}s`);

      const delay = Math.random() * 10;
      flake.style.setProperty('--delay', `${delay}s`);

      const totalTime = delay + duration;
      flake.dataset['totalTime'] = totalTime.toString();

      const swayDelay = Math.random() * 3;
      flake.style.setProperty('--sway-delay', `${swayDelay}s`);

      const amplitude = 30 + Math.random() * 40; // 30–70 px
      const dir = Math.random() < 0.5 ? -1 : 1;

      flake.style.setProperty('--x1', `${dir * amplitude}px`);
      flake.style.setProperty('--x2', `${-dir * amplitude}px`);

      const rotationVariation = Math.random() * 60 - 30; // ±30°
      flake.style.setProperty('--r1', `${90 + rotationVariation}deg`);
      flake.style.setProperty('--r2', `${180 + rotationVariation}deg`);
      flake.style.setProperty('--r3', `${270 + rotationVariation}deg`);
      flake.style.setProperty('--r4', `${360 + rotationVariation}deg`);

      fragment.appendChild(flake);
    }

    container.appendChild(fragment);
  }
}
