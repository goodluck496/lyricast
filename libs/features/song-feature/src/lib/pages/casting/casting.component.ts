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
import { ISong, LyricForCasting } from '@lyri-cast/entities';

import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal, { Api } from 'reveal.js';

import { Store } from '@ngrx/store';
import { BridgeService, Pages } from '@lyri-cast/common-browser';
import {
  selectCastingPaused,
  selectCastingProcess,
  selectNavigateState,
  SONG_ACTIONS,
  SongPayloadsMap,
  SongStartCastingPayload,
} from '@lyri-cast/song-store';

@Component({
  selector: 'lyri-casting-page',
  standalone: true,
  imports: [Ng2FittextModule],
  templateUrl: './casting.component.html',
  styleUrl: './casting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CastingComponent implements OnInit, AfterViewInit {
  private readonly bridge = inject(BridgeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly store = inject(Store);

  deckRef?: Reveal.Api;

  selectedSong = signal<ISong | null>(null);
  selectedLyric = signal<LyricForCasting | null>(null);
  selectedLyrics = signal<LyricForCasting[]>([]);

  showingContent = signal(false);
  lines = signal<string[]>([]);

  fitTexts = viewChildren(Ng2FittextDirective);

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
    });

    this.store.select(selectCastingProcess).subscribe((data) => {
      if (data) {
        this.startCastingHandler(data);
      }
    });

    this.store.select(selectNavigateState).subscribe((data) => {
      if (data) {
        this.navigateCastingHandler(data);
      }
    });
  }

  async ngAfterViewInit() {
    await this.initReveal();

    this.bridge.windowSrv.electronContext.send({
      event: SONG_ACTIONS.openedPage,
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  async startCastingHandler(payload: SongStartCastingPayload) {
    this.clearSlides();

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
      this.deckRef?.slide(0, 1);
    }
    this.updateTextSize();
  }

  navigateCastingHandler(payload: SongPayloadsMap['SLIDE_NAVIGATE']) {
    if (!this.deckRef) {
      return;
    }

    if (payload.direction) {
      this.deckRef[payload.direction]();
    } else if (payload.index !== undefined) {
      this.deckRef.slide(undefined, payload.index);
    }

    this.selectedLyric.set(payload.currentLyric);
    this.cdr.detectChanges();
    this.updateTextSize();
  }

  async initReveal(): Promise<Api> {
    return new Promise((res, rej) => {
      setTimeout(async () => {
        this.deckRef = new Reveal(this.elRef.nativeElement);

        const deck = await this.deckRef?.initialize({
          margin: -1,
          disableLayout: true,
          transition: 'fade', //todo можно сделать событие, которое будет изменять тип переходов между слайдами
          center: true,
          embedded: true,
        });

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
}
