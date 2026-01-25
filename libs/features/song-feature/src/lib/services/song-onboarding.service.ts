import { DestroyRef, Injectable, inject } from '@angular/core';
import { IStepOption, TourService } from 'ngx-ui-tour-primeng';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge } from 'rxjs';

type TourEndLike = {
  end: () => void;
};

type TourNextLike = {
  next: () => void;
};

type TourRefreshLike = {
  refresh: () => void;
};

type TourRepositionLike = {
  reposition: () => void;
};

type TourStepShowLike = {
  stepShow$: { subscribe: (cb: (event: unknown) => void) => unknown };
};

type SongStepOption = IStepOption & {
  placement?: string;
};

@Injectable({ providedIn: 'root' })
export class SongOnboardingService {
  private readonly tourService = inject(TourService);
  private readonly destroyRef = inject(DestroyRef);

  private isRunning = false;
  private currentAnchorId: string | null = null;
  private isStepTrackingBound = false;

  private syncRunningWithOverlay(): void {
    const root = document.querySelector('tour-step-template');
    if (root) {
      return;
    }

    if (this.isRunning || this.currentAnchorId) {
      this.isRunning = false;
      this.currentAnchorId = null;
    }
  }

  constructor() {
    merge(
      fromEvent(window, 'resize'),
      fromEvent(window, 'scroll', { capture: true } as AddEventListenerOptions)
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncRunningWithOverlay();
        if (!this.isRunning) {
          return;
        }

        this.refreshPosition();
      });
  }

  private refreshPosition(): void {
    const tour = this.tourService;

    if (this.canTourRefresh(tour)) {
      queueMicrotask(() => tour.refresh());
      return;
    }

    if (this.canTourReposition(tour)) {
      queueMicrotask(() => tour.reposition());
    }
  }

  private readonly steps: SongStepOption[] = [
    {
      anchorId: 'songs:dict',
      title: 'Справочник',
      content: 'Сначала выбери справочник песен.',
      enableBackdrop: true,
      isAsync: false,
      placement: 'bottom',

    },
    {
      anchorId: 'songs:song',
      title: 'Песня',
      content: 'Выбери песню из списка.',
      enableBackdrop: false,
      isAsync: true,
    },
    {
      anchorId: 'songs:lyric-index-0',
      title: 'Куплет',
      content: 'Кликни по куплету/строке, чтобы выбрать её для трансляции.',
      nextOnAnchorClick: true,
      enableBackdrop: false,
      isAsync: true,
    },
    {
      anchorId: 'songs:lyric-count',
      title: 'Разделение на блоки',
      content:
        'Куплет/припев можно разделить на части, чтобы больше текста вместил слайд. ' +
        'Некоторые песни поделены автоматически, но этим селектором можно сбросить это разделение.',
      enableBackdrop: true,
      isAsync: true,
    },
    {
      anchorId: 'songs:cast-start',
      title: 'Транслировать',
      content: 'Нажми «Транслировать», чтобы открыть окно трансляции.',
      nextOnAnchorClick: true,
      enableBackdrop: true,
      isAsync: true,
    },
    {
      anchorId: 'songs:lyric',
      title: 'Переключение куплетов',
      content:
        'Можно выбрать другой куплет кликом. Также куплетами можно переключаться стрелками на клавиатуре или презентером.',
      nextOnAnchorClick: true,
      enableBackdrop: false,
      isAsync: true,
    },
    {
      anchorId: 'songs:cast-stop',
      title: 'Остановить',
      content: 'Нажми «Остановить», чтобы поставить трансляцию на паузу.',
      nextOnAnchorClick: true,
      placement: 'left',
      enableBackdrop: false,
      isAsync: true,
    },
    {
      anchorId: 'history',
      title: 'История',
      content: 'В истории можно быстро переключаться между ранее выбранными фрагментами.',
      enableBackdrop: false,
      isAsync: true,
    },
  ].map((el) => ({
    ...el,
    prevBtnTitle: 'Назад',
    nextBtnTitle: 'Вперед',
    endBtnTitle: 'Конец',
  }));

  start(): void {
    if (this.canTourEnd(this.tourService)) {
      this.tourService.end();
    }

    this.tourService.initialize(this.steps);
    this.isRunning = true;

    this.bindStepTracking();

    this.tourService.start();
  }

  startFrom(anchorId: string): void {
    const index = this.steps.findIndex((s) => s.anchorId === anchorId);
    const steps = index >= 0 ? this.steps.slice(index) : this.steps;

    if (this.canTourEnd(this.tourService)) {
      this.tourService.end();
    }

    this.tourService.initialize(steps);
    this.isRunning = true;

    this.bindStepTracking();

    this.tourService.start();
  }

  end(): void {
    this.isRunning = false;
    if (this.canTourEnd(this.tourService)) {
      this.tourService.end();
    }
  }

  goToOrRestart(params: { fromAnchorId: string; toAnchorId: string }): void {
    if (!this.canTourNext(this.tourService)) {
      return;
    }

    const hasOverlay = !!document.querySelector('tour-step-template');

    // Если тур уже схлопнулся (оверлея нет) — перезапускаем с нужного шага.
    if (!hasOverlay || !this.isRunning) {
      this.startFrom(params.toAnchorId);
      return;
    }

    // Если мы действительно на ожидаемом шаге — принудительно двигаемся дальше.
    if (this.currentAnchorId === params.fromAnchorId) {
      queueMicrotask(() => {
        this.tourService.next();
      });
      return;
    }
  }

  tryNext(expectedAnchorId: string): void {
    this.syncRunningWithOverlay();
    if (!this.isRunning) {
      return;
    }

    if (this.currentAnchorId !== expectedAnchorId) {
      return;
    }

    if (!this.canTourNext(this.tourService)) {
      return;
    }

    queueMicrotask(() => {
      this.tourService.next();
    });
  }

  private bindStepTracking(): void {
    if (this.isStepTrackingBound) {
      return;
    }

    if (!this.canTourStepShow(this.tourService)) {
      return;
    }

    this.isStepTrackingBound = true;

    this.tourService.stepShow$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        this.syncRunningWithOverlay();
        const anchorId = this.readAnchorIdFromStepShow(event);
        if (anchorId) {
          this.currentAnchorId = anchorId;

          const anchorEl = document.querySelector(
            `[tourAnchor="${anchorId}"], [ng-reflect-tour-anchor="${anchorId}"]`
          );
          if (anchorEl instanceof HTMLElement) {
            const rect = anchorEl.getBoundingClientRect();
            console.log('[onboarding] anchor rect', {
              anchorId,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                bottom: rect.bottom,
                right: rect.right,
              },
            });
          } else {
            console.log('[onboarding] anchor not found', { anchorId });
          }

          this.refreshPosition();
          requestAnimationFrame(() => {
            this.refreshPosition();
          });
        }
      });
  }

  private readAnchorIdFromStepShow(event: unknown): string | null {
    if (!event || typeof event !== 'object') {
      return null;
    }

    const anyEvent = event as { step?: { anchorId?: unknown } };
    const anchorId = anyEvent.step?.anchorId;
    return typeof anchorId === 'string' ? anchorId : null;
  }

  private canTourEnd(tour: unknown): tour is TourEndLike {
    if (!tour || typeof tour !== 'object') {
      return false;
    }

    const anyTour = tour as { end?: unknown };
    return typeof anyTour.end === 'function';
  }

  private canTourNext(tour: unknown): tour is TourNextLike {
    if (!tour || typeof tour !== 'object') {
      return false;
    }

    const anyTour = tour as { next?: unknown };
    return typeof anyTour.next === 'function';
  }

  private canTourRefresh(
    tour: TourService
  ): tour is TourService & TourRefreshLike {
    return typeof (tour as unknown as { refresh?: unknown }).refresh === 'function';
  }

  private canTourReposition(
    tour: TourService
  ): tour is TourService & TourRepositionLike {
    return (
      typeof (tour as unknown as { reposition?: unknown }).reposition === 'function'
    );
  }

  private canTourStepShow(tour: unknown): tour is TourStepShowLike {
    if (!tour || typeof tour !== 'object') {
      return false;
    }

    const anyTour = tour as { stepShow$?: unknown };
    return (
      !!anyTour.stepShow$ &&
      typeof (anyTour.stepShow$ as { subscribe?: unknown }).subscribe === 'function'
    );
  }
}
