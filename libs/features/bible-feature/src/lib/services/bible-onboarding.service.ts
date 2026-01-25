import { DestroyRef, Injectable, inject } from '@angular/core';
import { IStepOption, TourService } from 'ngx-ui-tour-primeng';
import { Store } from '@ngrx/store';
import { selectSelectedBook } from '@lyri-cast/bible-store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';

type TourEndLike = {
  end: () => void;
};

type TourNextLike = {
  next: () => void;
};

type TourStepShowLike = {
  stepShow$: { subscribe: (cb: (event: unknown) => void) => unknown };
};

type BibleStepOption = IStepOption & {
  placement?: string;
};

@Injectable({ providedIn: 'root' })
export class BibleOnboardingService {
  private readonly tourService = inject(TourService);
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);

  private isRunning = false;
  private currentAnchorId: string | null = null;
  private uiObserver: MutationObserver | null = null;
  private isStepTrackingBound = false;
  private isBookSelected = false;

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
    this.store
      .select(selectSelectedBook)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((book) => {
        this.isBookSelected = !!book;
        queueMicrotask(() => {
          this.updateUiPolicy();
        });
      });

    fromEvent<MouseEvent>(document, 'click', {
      capture: true,
    } as AddEventListenerOptions)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        if (!this.isRunning) {
          return;
        }

        if (!this.shouldBlockNavigation(e.target)) {
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
      });

    fromEvent<KeyboardEvent>(document, 'keydown', {
      capture: true,
    } as AddEventListenerOptions)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        if (!this.isRunning) {
          return;
        }

        if (e.key !== 'Enter' && e.key !== ' ') {
          return;
        }

        if (!this.shouldBlockNavigation(e.target)) {
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
      });
  }

  private shouldBlockNavigation(target: EventTarget | null): boolean {
    this.syncRunningWithOverlay();
    if (this.isBookSelected) {
      return false;
    }

    const root = document.querySelector('tour-step-template');
    if (!root) {
      return false;
    }

    const rootText = (root.textContent ?? '').toLowerCase();
    const isBookStep =
      this.currentAnchorId === 'bible:book' ||
      rootText.includes('книга') ||
      rootText.includes('bible:book');

    if (!isBookStep) {
      return false;
    }

    const el = target instanceof Element ? target : null;
    if (!el) {
      return false;
    }

    const inside = el.closest('tour-step-template');
    if (!inside) {
      return false;
    }

    const button = el.closest('button') as HTMLButtonElement | null;
    if (!button) {
      // Клик не по кнопке — не вмешиваемся.
      return false;
    }

    return !this.isCloseButton(button);
  }

  private canTourEnd(tourService: unknown): tourService is TourEndLike {
    return typeof (tourService as TourEndLike).end === 'function';
  }

  private canTourNext(tourService: unknown): tourService is TourNextLike {
    return typeof (tourService as TourNextLike).next === 'function';
  }

  private canListenStepShow(tourService: unknown): tourService is TourStepShowLike {
    return (
      typeof (tourService as TourStepShowLike).stepShow$ === 'object' &&
      typeof (tourService as TourStepShowLike).stepShow$?.subscribe === 'function'
    );
  }

  private updateUiPolicy(): void {
    // Кнопки рендерятся внутри <tour-step-template/>. Мы управляем ими через текст,
    // чтобы не зависеть от внутренних классов библиотеки.
    const root = document.querySelector('tour-step-template');
    if (!root) {
      return;
    }

    const buttons = Array.from(root.querySelectorAll('button'));

    const isCloseButton = (btn: HTMLButtonElement): boolean => this.isCloseButton(btn);

    const isPrevButton = (btn: HTMLButtonElement): boolean => {
      const text = (btn.textContent ?? '').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') ?? '').trim().toLowerCase();
      const title = (btn.getAttribute('title') ?? '').trim().toLowerCase();

      return (
        text === 'назад' ||
        text.startsWith('prev') ||
        text === 'back' ||
        aria.includes('prev') ||
        aria.includes('back') ||
        aria.includes('назад') ||
        title.includes('prev') ||
        title.includes('back') ||
        title.includes('назад')
      );
    };

    const findButtonByText = (rx: RegExp): HTMLButtonElement | null => {
      const btn = buttons.find((b) => rx.test((b.textContent ?? '').trim()));
      return (btn as HTMLButtonElement | undefined) ?? null;
    };

    const prevBtn =
      findButtonByText(/^назад$/i) ??
      findButtonByText(/^prev(ious)?$/i) ??
      findButtonByText(/^back$/i);
    if (prevBtn) {
      prevBtn.disabled = true;
    }

    const nextBtn =
      findButtonByText(/^далее$/i) ??
      findButtonByText(/^next$/i) ??
      findButtonByText(/^вперед$/i);

    const rootText = (root.textContent ?? '').toLowerCase();
    const looksLikeBookStep = rootText.includes('книга');
    const isBookStep = this.currentAnchorId === 'bible:book' || looksLikeBookStep;

    if (isBookStep) {
      // На шаге "Книга" запрещаем кнопки навигации (чтобы нельзя было пролистать шаг),
      // но оставляем доступной кнопку закрытия тура.
      for (const btn of buttons) {
        if (isCloseButton(btn)) {
          continue;
        }
        btn.disabled = true;
      }

      // После выбора книги включаем только кнопку "Далее" (не "Назад").
      if (this.isBookSelected) {
        for (const btn of buttons) {
          if (isCloseButton(btn) || isPrevButton(btn)) {
            continue;
          }
          btn.disabled = false;
        }
      }
      return;
    }

    // В остальных шагах — отключаем "Назад" всегда, а "Далее" пусть работает.
    if (nextBtn) {
      nextBtn.disabled = false;
    }
  }

  private ensureUiObserver(): void {
    if (this.uiObserver) {
      return;
    }

    this.uiObserver = new MutationObserver(() => {
      this.syncRunningWithOverlay();
      this.updateUiPolicy();
    });

    this.uiObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  }

  private bindStepTracking(): void {
    if (this.isStepTrackingBound) {
      return;
    }

    if (!this.canListenStepShow(this.tourService)) {
      return;
    }

    this.isStepTrackingBound = true;

    // В разных версиях event может отличаться по форме, поэтому вытаскиваем anchorId максимально безопасно.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.tourService as unknown as TourStepShowLike).stepShow$.subscribe((e: any) => {
      const anchorId: unknown = e?.step?.anchorId ?? e?.anchorId;
      this.currentAnchorId = typeof anchorId === 'string' ? anchorId : null;
      this.isRunning = true;
      this.updateUiPolicy();
    });
  }

  private isCloseButton(btn: HTMLButtonElement): boolean {
    const text = (btn.textContent ?? '').trim().toLowerCase();
    const aria = (btn.getAttribute('aria-label') ?? '').trim().toLowerCase();
    const title = (btn.getAttribute('title') ?? '').trim().toLowerCase();

    return (
      text === '×' ||
      text.includes('закры') ||
      text.includes('готово') ||
      text.includes('конец') ||
      text.includes('finish') ||
      text.includes('done') ||
      text.includes('close') ||
      aria.includes('close') ||
      aria.includes('закры') ||
      title.includes('close') ||
      title.includes('закры')
    );
  }

  private readonly steps: BibleStepOption[] = [
    {
      anchorId: 'menu:bible',
      title: 'Модуль «Библия»',
      content: 'Здесь ты выбираешь перевод, книгу, главу и стих(и), а затем отправляешь их в трансляцию.',
      enableBackdrop: true,
      isAsync: true,
    },
    {
      anchorId: 'bible:translate',
      title: 'Перевод',
      content: 'Сначала выбери перевод Библии.',
      enableBackdrop: true,
      isAsync: true,
    },
    {
      anchorId: 'bible:book',
      title: 'Книга',
      content: 'Далее выбери книгу.',
      nextOnAnchorClick: true,
      enableBackdrop: true,
      isAsync: true,
    },
    {
      anchorId: 'bible:chapter',
      title: 'Глава',
      content: 'Затем выбери главу.',
      nextOnAnchorClick: true,
      enableBackdrop: true,
      isAsync: true,
    },
    {
      anchorId: 'bible:verse',
      title: 'Стих',
      content: 'Кликни по стиху, чтобы выбрать его.',
      nextOnAnchorClick: true,
      enableBackdrop: false,
      isAsync: true,
    },
    {
      anchorId: 'bible:shift',
      title: 'Выбор диапазона',
      content: 'С зажатым Shift можно быстро выделить диапазон стихов (клик по другому стиху расширяет/сужает диапазон).',
      enableBackdrop: false,
      isAsync: true,
    },
    {
      anchorId: 'bible:cast-start',
      title: 'Транслировать',
      content: 'Нажми «Транслировать», чтобы открыть окно трансляции.',
      nextOnAnchorClick: true,
      placement: 'left',
      enableBackdrop: true,
      isAsync: true,
    },
    {
      anchorId: 'bible:cast-stop',
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
    endBtnTitle: 'Конец'
  }));

  start(): void {
    if (this.canTourEnd(this.tourService)) {
      this.tourService.end();
    }

    this.isRunning = true;
    this.currentAnchorId = null;
    this.ensureUiObserver();
    this.bindStepTracking();

    this.tourService.initialize(this.steps);
    this.tourService.start();

    // На случай если stepShow$ недоступен — всё равно применим политику UI.
    queueMicrotask(() => {
      this.updateUiPolicy();
    });
  }

  tryNext(expectedAnchorId?: string): void {
    if (!this.isRunning) {
      return;
    }

    // Если UI тура уже не отображается (например, тур завершён извне),
    // не пытаемся его продвигать и сбрасываем флаг.
    const root = document.querySelector('tour-step-template');
    if (!root || root.querySelectorAll('button').length === 0) {
      this.isRunning = false;
      this.currentAnchorId = null;
      return;
    }

    if (expectedAnchorId && this.currentAnchorId !== expectedAnchorId) {
      return;
    }

    if (this.canTourNext(this.tourService)) {
      this.tourService.next();
    }
  }

  end(): void {
    this.isRunning = false;
    this.currentAnchorId = null;
    if (this.canTourEnd(this.tourService)) {
      this.tourService.end();
    }
  }
}
