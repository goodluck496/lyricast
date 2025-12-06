import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject, input,
  OnInit,
  signal,
  viewChildren
} from '@angular/core';
import { BibleBookShort, BibleVerseForCasting } from '@lyri-cast/entities';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import Reveal, { Api } from 'reveal.js';

import { Store } from '@ngrx/store';
import { BridgeService, Pages } from '@lyri-cast/common-browser';
import {
  BiblePresentationNavigatePayload,
  BibleStartCastingPayload,
  selectCastingPaused,
  selectCastingProcess,
  selectCastingProcessNavigate,
} from '@lyri-cast/bible-store';

import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'lyri-bible-casting-page',
  standalone: true,
  imports: [Ng2FittextModule],
  templateUrl: './bible-casting.component.html',
  styleUrl: './bible-casting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleCastingComponent implements OnInit, AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly bridge = inject(BridgeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly store = inject(Store);

  isMainWindow = input(false);

  deckRef?: Reveal.Api;

  selectedBookTitle = signal('');

  selectedBook = signal<BibleBookShort | null>(null);
  selectedChapterId = signal<number | null>(null);
  selectedContents = signal<BibleVerseForCasting[]>([]);
  selectedVerseId = signal<number>(1);
  selectedRange = signal<{ from: number; to: number } | null>(null);

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

  constructor(private sanitizer: DomSanitizer) {}

  // Функция для санитизации HTML
  sanitizeHtml(rawHtml: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(rawHtml);
  }

  ngOnInit() {
    this.castingPaused$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.showingContent.set(!value);
      });

    this.store.select(selectCastingProcess).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
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

    if(this.isMainWindow()) {
      return;
    }
    this.bridge.windowSrv.electronContext.send({
      event: 'OPENED_PAGE', //SONG_ACTIONS.openedPage,
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  async startCastingHandler(payload: BibleStartCastingPayload) {
    this.clearSlides();

    this.selectedBook.set(payload.book);
    this.selectedBookTitle.set(payload.book.title.full);
    this.selectedChapterId.set(payload.chapter.number);
    const range = payload.range ?? null;
    this.selectedRange.set(range);

    if (range) {
      const versesInRange = payload.content.filter(
        (v) => v.number >= range.from && v.number <= range.to
      );

      if (versesInRange.length > 1) {
        const first = versesInRange[0];
        const combinedHtml = versesInRange
          .map((v) => {
            const text = Array.isArray(v.text) ? v.text.join(' ') : (v as any).text;
            return `<span class="bible-casting__verse-number">${v.number}</span> ${text}`;
          })
          .join(' ');

        this.selectedContents.set([
          {
            ...first,
            text: [combinedHtml],
          },
        ]);

        this.selectedVerseId.set(range.from);
      } else {
        // Диапазон фактически из одного стиха — ведём себя как для одиночного стиха.
        this.selectedContents.set(payload.content);
        this.selectedVerseId.set(payload.fromIndex ?? 0);
        this.selectedRange.set(null);
      }
    } else {
      this.selectedContents.set(payload.content);
      this.selectedVerseId.set(payload.fromIndex ?? 0);
    }

    this.showingContent.set(true);
    this.cdr.detectChanges();

    await this.initReveal();
    this.deckRef?.layout();
    this.deckRef?.sync();

    // Для диапазона всегда показываем первый (и единственный) слайд,
    // для одиночного стиха оставляем существующее поведение.
    const hasRange = !!payload.range;
    if (hasRange) {
      // Первый дочерний section внутри stack пустой (placeholder),
      // реальные слайды начинаются с индекса 1.
      this.deckRef?.slide(undefined, 1);
    } else if (payload.fromIndex) {
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
    // Если навигация пришла с диапазоном и набором стихов — обновляем один слайд
    if (payload.range && payload.versesInRange && payload.versesInRange.length > 1) {
      this.selectedRange.set(payload.range);

      const combinedHtml = payload.versesInRange
        .map((v) => {
          const text = Array.isArray(v.text) ? v.text.join(' ') : (v as any).text;
          return `<span class="bible-casting__verse-number">${v.number}</span> ${text}`;
        })
        .join(' ');

      const first = payload.versesInRange[0];

      this.selectedContents.set([
        {
          ...first,
          text: [combinedHtml],
        },
      ]);

      this.selectedVerseId.set(payload.range.from);

      const bookName = first.bookTitle;
      this.selectedBookTitle.set(bookName.full);
      this.selectedChapterId.set(first.chapterId);

      this.cdr.detectChanges();
      this.deckRef.layout();
      this.deckRef.sync();
      this.updateTextSize();
    } else {
      // Для навигации без диапазона (или с диапазоном из одного стиха)
      // всегда показываем один стих на одном слайде.
      this.selectedRange.set(null);
      this.selectedContents.set([
        {
          ...payload.currentContent,
        },
      ]);

      const bookName = payload.currentContent.bookTitle;

      this.selectedBookTitle.set(bookName.full);
      this.selectedChapterId.set(payload.currentContent.chapterId);
      this.selectedVerseId.set(payload.currentContent.number);

      this.cdr.detectChanges();
      this.deckRef.layout();
      this.deckRef.sync();
      this.updateTextSize();
    }
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
      // controlsBackArrows: 'hidden',
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
