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
import { BibleVerse, BibleVerseForCasting } from '@lyri-cast/entities';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import {
  FreeSlideActions, FreeSlideActionsEnum,
  FreeSlideNavigatePayload,
  selectFreeSlideNavigateState
} from '@lyri-cast/free-slide-store';
import { filterEmpty } from '@lyri-cast/common';

@Component({
  selector: 'lyri-free-slide-casting-preview',
  standalone: true,
  imports: [CommonModule, Ng2FittextModule],
  templateUrl: './free-slide-casting-preview.component.html',
  styleUrl: './free-slide-casting-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideCastingPreviewComponent
  implements OnDestroy, AfterViewInit
{
  public elRef = inject(ElementRef<HTMLElement>);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private store = inject(Store);
  private actions = inject(Actions);

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  slideText = '';

  fitTextRef = viewChild(Ng2FittextDirective);

  initTimeoutId: any;

  public selectedBibleVerse = signal<BibleVerse | null>(null);
  public selectedBibleVerseForCast = signal<BibleVerseForCasting | null>(null);

  selectedSlide$ = this.store.select(selectFreeSlideNavigateState);

  stopCasting$ = this.actions.pipe(ofType(FreeSlideActions[FreeSlideActionsEnum.stopCasting]));
  startCasting$ = this.actions.pipe(ofType(FreeSlideActions[FreeSlideActionsEnum.startCasting]));

  constructor() {
    this.selectedSlide$
      .pipe(filterEmpty(), takeUntilDestroyed())
      .subscribe((data: FreeSlideNavigatePayload) => {
        this.slideText = data.slide.htmlString;
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
