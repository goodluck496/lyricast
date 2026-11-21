import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ISong, LyricForCasting } from '@lyri-cast/entities';

import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal, { Api } from 'reveal.js';

import { Store } from '@ngrx/store';
import {
  BridgeService,
  CastingAppearanceService,
  DEFAULT_CASTING_APPEARANCE,
  Pages,
  SnowfallManager,
} from '@lyri-cast/common-browser';
import {
  selectCastingAppearance,
  selectCastingPaused,
  selectCastingProcess,
  selectNavigateState,
  SongPresentationNavigatePayload,
  SongStartCastingPayload,
} from '@lyri-cast/song-store';
import { APP_COMMON_ACTIONS } from '@lyri-cast/common-electron';
import { sanitize } from 'quill/formats/link';
import { DomSanitizer } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'lyri-casting-page',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule],
  templateUrl: './casting.component.html',
  styleUrl: './casting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CastingComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly bridge = inject(BridgeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly store = inject(Store);
  private readonly snowfall = inject(SnowfallManager);
  protected readonly appearanceService = inject(CastingAppearanceService);
  sanitizer: DomSanitizer = inject(DomSanitizer);
  protected readonly appearance = this.appearanceService.appearance;
  protected readonly displayAppearance = signal(DEFAULT_CASTING_APPEARANCE);

  deckRef?: Reveal.Api;

  selectedSong = signal<ISong | null>(null);
  selectedLyric = signal<LyricForCasting | null>(null);
  selectedLyrics = signal<LyricForCasting[]>([]);

  showingContent = signal(false);
  lines = signal<string[]>([]);

  fitTexts = viewChildren(Ng2FittextDirective);

  hideContent = true;
  isBlackout = signal(false);
  private revealInitVersion = 0;
  private hideContentTimeoutId: ReturnType<typeof setTimeout> | null = null;

  castingPaused$ = this.store.select(selectCastingPaused);

  @HostListener('window:resize', ['$event'])
  resizeHandler() {
    if (!this.deckRef) {
      return;
    }

    this.deckRef.layout();
    this.updateTextSize();
  }

  ngOnInit() {
    this.castingPaused$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
      this.showingContent.set(!value);
      this.displayAppearance.set(!value ? this.appearance() : DEFAULT_CASTING_APPEARANCE);

      if (value) {
        // Кастинг на паузе или завершён — убираем снежинки
        this.snowfall.stop();
      } else {
        // Кастинг активен — включаем снежинки (если пользователь их разрешил в настройках)
        this.snowfall.ensureRunning();
      }

      this.clearHideContentTimeout();
      this.hideContentTimeoutId = setTimeout(() => {
        this.hideContent = value;
        this.cdr.detectChanges();
      }, 500);
    });

    this.store.select(selectCastingProcess)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
      console.log('change cast proc', data);
      if (data) {
        this.startCastingHandler(data);
        return;
      }

      this.clearSlides();
      this.cdr.detectChanges();
    });

    this.store.select(selectNavigateState)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
      if (data) {
        this.navigateCastingHandler(data);
      }
    });

    this.store.select(selectCastingAppearance)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((appearance) => {
      this.appearanceService.set(appearance);
      if (this.showingContent()) {
        this.displayAppearance.set(appearance);
      }
      this.cdr.detectChanges();
      this.updateTextSize();
    });

    this.bridge.queueEvents
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => {
        if (!evt) return;
        if (evt.event === 'BLACKOUT_ALL') {
          const payload = evt.payload as { active?: boolean } | undefined;
          this.isBlackout.set(payload?.active ?? !this.isBlackout());
          this.cdr.markForCheck();
        }
      });
  }

  async ngAfterViewInit() {
    await this.initReveal();

    this.bridge.windowSrv.electronContext.send({
      event: APP_COMMON_ACTIONS.openedPage,
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  ngOnDestroy() {
    this.clearHideContentTimeout();
    this.deckRef?.destroy();
  }

  async startCastingHandler(payload: SongStartCastingPayload) {
    const wasShowingContent = this.showingContent();
    const isSameSong =
      this.selectedSong()?.key === payload.song?.key &&
      this.selectedSong()?.number === payload.song?.number;
    const canLiveUpdate = wasShowingContent && !!this.deckRef && isSameSong;

    if (canLiveUpdate) {
      if (payload.appearance) {
        this.appearanceService.set(payload.appearance);
        this.displayAppearance.set(payload.appearance);
      }
      this.selectedSong.set(payload.song);
      this.selectedLyrics.set(payload.lyrics);
      this.selectedLyric.set(payload.currentLyric);
      this.cdr.detectChanges();

      this.deckRef?.sync();
      this.deckRef?.layout();

      const targetSlide = (payload.fromIndex ?? 0) + 1;
      this.deckRef?.slide(undefined, targetSlide);

      this.updateTextSize();
      return;
    }

    this.clearSlides();
    const version = ++this.revealInitVersion;
    this.appearanceService.set(
      wasShowingContent ? this.appearance() : payload.appearance ?? this.appearance()
    );
    this.displayAppearance.set(this.appearance());

    this.selectedSong.set(payload.song);
    this.selectedLyrics.set(payload.lyrics);
    this.selectedLyric.set(payload.currentLyric);
    this.showingContent.set(true);
    this.cdr.detectChanges();

    await this.initReveal(version);
    if (version !== this.revealInitVersion || !this.showingContent()) {
      return;
    }

    this.deckRef?.layout();
    this.deckRef?.sync();

    if (payload.fromIndex) {
      /**
       * добавляем к индексу 1, т.к. первым слайдом всегда идет заглушка
       * чтобы при переключении слайдов не мерцал первый слайд (особенности реализации библиотеки презентации)
       */
      this.deckRef?.slide(undefined, payload.fromIndex + 1);
    } else {
      /**
       * т.к. первым слайдом всегда идет заглушка, то начинаем с индекса 1
       */
      this.deckRef?.slide(0, 1 );
    }
    this.updateTextSize();

    this.clearHideContentTimeout();
    this.hideContentTimeoutId = setTimeout(() => {
      if (version !== this.revealInitVersion || !this.showingContent()) {
        return;
      }

      this.hideContent = false;
      this.cdr.detectChanges();
    }, 500);
  }

  navigateCastingHandler(payload: SongPresentationNavigatePayload) {
    if (!this.deckRef) {
      return;
    }

    if (payload.index !== undefined) {
      this.deckRef.slide(undefined, payload.index + 1);
    } else if (payload.direction) {
      this.deckRef[payload.direction]();
    }

    this.selectedLyric.set(payload.currentLyric);
    this.cdr.detectChanges();
    this.updateTextSize();
  }

  async initReveal(version = this.revealInitVersion): Promise<Api | undefined> {
    return new Promise((res) => {
      setTimeout(async () => {
        if (version !== this.revealInitVersion) {
          res(undefined);
          return;
        }

        const revealContainer = this.elRef.nativeElement.querySelector('.reveal')
        if (!revealContainer) {
          res(undefined);
          return;
        }

        this.deckRef = new Reveal(revealContainer, {
          margin: -1,
          disableLayout: true,
          transition: 'fade', //todo можно сделать событие, которое будет изменять тип переходов между слайдами
          center: true,
          embedded: true,
          hideInactiveCursor: true,
          controlsBackArrows: 'hidden',
          controls: false,

        });

        const deck = await this.deckRef?.initialize();
        if (version !== this.revealInitVersion) {
          this.deckRef?.destroy();
        }

        res(deck);
      }, 300);
    });
  }

  updateTextSize() {
    this.fitTexts().forEach((el) => {
      el.onResize(new Event('resize'));
    });
  }

  clearSlides(): void {
    this.revealInitVersion++;
    this.clearHideContentTimeout();
    this.deckRef?.destroy();

    this.showingContent.set(false);
    this.displayAppearance.set(DEFAULT_CASTING_APPEARANCE);
    this.hideContent = true;
  }

  private clearHideContentTimeout(): void {
    if (!this.hideContentTimeoutId) {
      return;
    }

    clearTimeout(this.hideContentTimeoutId);
    this.hideContentTimeoutId = null;
  }

  protected readonly sanitize = sanitize;
}
