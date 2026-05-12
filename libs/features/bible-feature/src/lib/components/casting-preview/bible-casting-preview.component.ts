import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';


import Reveal from 'reveal.js';
import { BibleChapterSection, BibleVerse, BibleVerseForCasting } from '@lyri-cast/entities';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import {
  BibleActions,
  selectSelectedVersesRange,
  selectSelectedBibleVerse,
  selectSelectedBook,
  selectSelectedChapterSections,
} from '@lyri-cast/bible-store';
import { combineLatest } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';
import { CastingAppearanceService } from '@lyri-cast/common-browser';

@Component({
  selector: 'lyri-bible-casting-preview',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule],
  templateUrl: './bible-casting-preview.component.html',
  styleUrl: './bible-casting-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleCastingPreviewComponent implements OnDestroy, AfterViewInit {
  public elRef = inject(ElementRef<HTMLElement>);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private store = inject(Store);
  private actions = inject(Actions);
  protected readonly appearanceService = inject(CastingAppearanceService);
  protected readonly appearance = this.appearanceService.appearanceFor('bible');

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  slideText = '';

  fitTextRef = viewChild(Ng2FittextDirective);

  initTimeoutId: any;

  public selectedBibleVerse = signal<BibleVerse | null>(null);
  public selectedBibleVerseForCast = signal<BibleVerseForCasting | null>(null);
  public selectedRange = signal<{ from: number; to: number } | null>(null);

  selectedVerse$ = this.store.select(selectSelectedBibleVerse);
  selectedBook$ = this.store.select(selectSelectedBook);
  selectedRange$ = this.store.select(selectSelectedVersesRange);
  sections$ = this.store.select(selectSelectedChapterSections);

  stopCasting$ = this.actions.pipe(ofType(BibleActions.stopCasting));
  startCasting$ = this.actions.pipe(ofType(BibleActions.startCasting));

  constructor() {
    combineLatest([
      this.selectedBook$.pipe(filterEmpty()),
      this.selectedVerse$.pipe(filterEmpty()),
      this.selectedRange$,
      this.sections$,
    ])
      .pipe(takeUntilDestroyed())
      .subscribe(([book, verse, range, sections]) => {
        this.selectedBibleVerse.set(verse);
        this.selectedBibleVerseForCast.set({
          ...verse,
          text: [verse.text],
          bookTitle: book.title,
        });
        this.selectedRange.set(range);

        const allVerses = (sections as BibleChapterSection[]).flatMap(
          (sec) => sec.content
        );
        const fromNumber = range?.from ?? verse.number;
        const toNumber = range?.to ?? verse.number;
        const versesInRange = allVerses.filter(
          (v) => v.number >= fromNumber && v.number <= toNumber
        );

        if (versesInRange.length > 1) {
          this.slideText = versesInRange
            .map((v) => {
              const text = v.text;
              return `<span class="bible-casting__verse-number">${v.number}</span> ${text}`;
            })
            .join(' ');
        } else if (versesInRange.length === 1) {
          // Для одиночного стиха в "диапазоне" не показываем номер, как и при обычном кастинге
          this.slideText = versesInRange[0].text;
        } else {
          this.slideText = verse.text;
        }

        this.initReveal();
      });

    this.stopCasting$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deckRef?.sync();
      this.closePreview();
    });
    this.startCasting$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deckRef?.sync();
      this.initReveal();
    });
  }

  async initReveal(): Promise<void> {
    // this.cdr.detectChanges();
    this.deckRef?.layout();
    this.deckRef?.sync();

    setTimeout(() => {
      this.fitTextRef()?.el.nativeElement.dispatchEvent(new Event('input'));
    }, 10);
  }

  initDeck(): void {
    this.initTimeoutId = setTimeout(async () => {
      try {
        this.deckRef = new Reveal(this.elRef.nativeElement);
        this.deck = await this.deckRef?.initialize({
          width: 400,
          height: 260,
          margin: -1,
          transition: 'fade',
          disableLayout: true,
          embedded: true,
          overview: false,
          keyboard: false,
        });
        await this.initReveal();
        this.cdr.detectChanges();
      } catch (err) {
        clearTimeout(this.initTimeoutId);
        this.initDeck();
        console.error(err);
      }
    }, 500);
  }

  closePreview(): void {
    this.deck?.destroy?.();
  }

  ngAfterViewInit() {
    this.initDeck();
  }

  ngOnDestroy() {
    clearTimeout(this.initTimeoutId);
    this.deck?.destroy?.();
  }
}
