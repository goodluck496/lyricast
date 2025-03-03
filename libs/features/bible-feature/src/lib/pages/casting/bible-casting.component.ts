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
import { BibleBookShort, BibleVerseForCasting } from '@lyri-cast/entities';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal, { Api } from 'reveal.js';

import { Store } from '@ngrx/store';
import { BridgeService, Pages } from '@lyri-cast/common-browser';
import {
  selectCastingPaused,
  selectCastingProcess,
  selectCastingProcessNavigate,
} from '../../store/bible.selectors';
import {
  BiblePresentationNavigatePayload,
  BibleStartCastingPayload,
} from '../../store/bible.actions';

@Component({
  selector: 'lyri-bible-casting-page',
  standalone: true,
  imports: [Ng2FittextModule],
  templateUrl: './bible-casting.component.html',
  styleUrl: './bible-casting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleCastingComponent implements OnInit, AfterViewInit {
  private readonly bridge = inject(BridgeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly store = inject(Store);

  deckRef?: Reveal.Api;

  selectedBookTitle = signal('');

  selectedBook = signal<BibleBookShort | null>(null);
  selectedChapterId = signal<number | null>(null);
  selectedContents = signal<BibleVerseForCasting[]>([]);
  selectedVerseId = signal<number>(1);

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

    this.store.select(selectCastingProcessNavigate).subscribe((data) => {
      if (data) {
        console.log('data', data);
        this.navigateCastingHandler(data);
      }
    });
  }

  async ngAfterViewInit() {
    await this.initReveal();

    this.bridge.windowSrv.electronContext.send({
      event: 'OPENED_PAGE', //SONG_ACTIONS.openedPage,
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  async startCastingHandler(payload: BibleStartCastingPayload) {
    this.clearSlides();

    this.selectedBook.set(payload.book);
    this.selectedBookTitle.set(payload.book.title.full);
    this.selectedContents.set(payload.content);
    this.selectedChapterId.set(payload.chapter.number);
    this.showingContent.set(true);
    this.selectedVerseId.set(payload.fromIndex || 1);
    this.cdr.detectChanges();

    await this.initReveal();
    this.deckRef?.layout();
    this.deckRef?.sync();

    if (payload.fromIndex) {
      this.deckRef?.slide(undefined, payload.fromIndex);
    } else {
      this.deckRef?.slide(0, 0);
    }
    this.updateTextSize();
  }

  navigateCastingHandler(
    payload: BiblePresentationNavigatePayload /*SongPayloadsMap['SLIDE_NAVIGATE']*/
  ) {
    if (!this.deckRef) {
      return;
    }
    if (payload.direction) {
      this.deckRef[payload.direction]();
    } else if (payload.nextIndex !== undefined) {
      this.deckRef.slide(undefined, payload.nextIndex);
    }

    const bookName = payload.currentContent.bookTitle;

    this.selectedBookTitle.set(bookName.full);
    this.selectedChapterId.set(payload.currentContent.chapterId);
    this.selectedVerseId.set(payload.currentContent.number);

    this.cdr.detectChanges();
  }

  async initReveal(): Promise<Api> {
    this.deckRef = new Reveal(this.elRef.nativeElement);

    const deck = await this.deckRef?.initialize({
      margin: -1,
      disableLayout: true,
      transition: 'fade', //todo можно сделать событие, которое будет изменять тип переходов между слайдами
      center: true,
      embedded: true,
      progress: false,
      controls: false,
      overview: false,
    });

    return deck;
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
