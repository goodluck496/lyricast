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
} from '@angular/core';
import { CommonModule } from '@angular/common';

import Reveal from 'reveal.js';
import { BibleVerse, BibleVerseForCasting } from '@lyri-cast/entities';
import { Ng2FittextModule } from 'ng2-fittext';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { BibleActions, selectSelectedBibleVerse, selectSelectedBook } from '@lyri-cast/bible-store';
import { combineLatest } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';

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

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  slideText = '';

  initTimeoutId: any;

  public selectedBibleVerse = signal<BibleVerse | null>(null);
  public selectedBibleVerseForCast = signal<BibleVerseForCasting | null>(null);

  selectedVerse$ = this.store.select(selectSelectedBibleVerse);
  selectedBook$ = this.store.select(selectSelectedBook);

  stopCasting$ = this.actions.pipe(ofType(BibleActions.stopCasting));
  startCasting$ = this.actions.pipe(ofType(BibleActions.startCasting));

  constructor() {
    combineLatest([
      this.selectedBook$.pipe(filterEmpty()),
      this.selectedVerse$.pipe(filterEmpty()),
    ]).pipe(takeUntilDestroyed()).subscribe(([book, verse]) => {
      this.selectedBibleVerse.set(verse);
      this.selectedBibleVerseForCast.set({
        ...verse,
        text: [verse.text],
        bookTitle: book.title,
      });

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
    this.slideText = this.selectedBibleVerse()?.text || '';

    // this.cdr.detectChanges();
    this.deckRef?.layout();
    this.deckRef?.sync();
  }

  initDeck(): void {
    this.initTimeoutId = setTimeout(async () => {
      try {
        this.deckRef = new Reveal(this.elRef.nativeElement);
        this.deck = await this.deckRef?.initialize({
          width: 400,
          height: 300,
          margin: -1,
          transition: 'fade',
          disableLayout: true,
          embedded: true,
          overview: false,
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
