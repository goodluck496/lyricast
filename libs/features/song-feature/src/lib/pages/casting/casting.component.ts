import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ISong, LyricForCasting } from '@lyri-cast/entities';

import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal, { Api } from 'reveal.js';

import { Store } from '@ngrx/store';
import { BridgeService, CastingAppearanceService, Pages, SnowfallManager } from '@lyri-cast/common-browser';
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

@Component({
  selector: 'lyri-casting-page',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule],
  templateUrl: './casting.component.html',
  styleUrl: './casting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CastingComponent implements OnInit, AfterViewInit {
  private readonly bridge = inject(BridgeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly store = inject(Store);
  private readonly snowfall = inject(SnowfallManager);
  protected readonly appearanceService = inject(CastingAppearanceService);
  sanitizer: DomSanitizer = inject(DomSanitizer);
  protected readonly appearance = this.appearanceService.appearance;

  deckRef?: Reveal.Api;

  selectedSong = signal<ISong | null>(null);
  selectedLyric = signal<LyricForCasting | null>(null);
  selectedLyrics = signal<LyricForCasting[]>([]);

  showingContent = signal(false);
  lines = signal<string[]>([]);

  fitTexts = viewChildren(Ng2FittextDirective);

  hideContent = true;

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
    this.castingPaused$.subscribe((value) => {
      this.showingContent.set(!value);

      if (value) {
        // Кастинг на паузе или завершён — убираем снежинки
        this.snowfall.stop();
      } else {
        // Кастинг активен — включаем снежинки (если пользователь их разрешил в настройках)
        this.snowfall.ensureRunning();
      }

      setTimeout(() => {
        this.hideContent = value;
        this.cdr.detectChanges();
      }, 500);
    });

    this.store.select(selectCastingProcess).subscribe((data) => {
      console.log('change cast proc', data);
      if (data) {
        this.startCastingHandler(data);
      }
    });

    this.store.select(selectNavigateState).subscribe((data) => {
      if (data) {
        this.navigateCastingHandler(data);
      }
    });

    this.store.select(selectCastingAppearance).subscribe((appearance) => {
      this.appearanceService.set(appearance);
      this.cdr.detectChanges();
      this.updateTextSize();
    });
  }

  async ngAfterViewInit() {
    await this.initReveal();

    this.bridge.windowSrv.electronContext.send({
      event: APP_COMMON_ACTIONS.openedPage,
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  async startCastingHandler(payload: SongStartCastingPayload) {
    this.clearSlides();
    this.appearanceService.set(payload.appearance ?? this.appearance());

    this.selectedSong.set(payload.song);
    this.selectedLyrics.set(payload.lyrics);
    this.selectedLyric.set(payload.currentLyric);
    this.showingContent.set(true);
    this.cdr.detectChanges();

    await this.initReveal();
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

    setTimeout(() => {
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

  async initReveal(): Promise<Api> {
    return new Promise((res, rej) => {
      setTimeout(async () => {
        const revealContainer = this.elRef.nativeElement.querySelector('.reveal')
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
    this.deckRef?.destroy();

    this.showingContent.set(false);
  }

  protected readonly sanitize = sanitize;
}
