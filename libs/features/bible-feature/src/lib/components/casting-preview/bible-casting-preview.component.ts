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
  computed,
  effect,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import Reveal from 'reveal.js';
import { Ng2FittextDirective, Ng2FittextModule } from 'ng2-fittext';

import {
  BibleChapterSection,
  BibleVerse,
  BibleVerseForCasting,
} from '@lyri-cast/entities';
import { filterEmpty } from '@lyri-cast/common';
import { CastingAppearanceService } from '@lyri-cast/common-browser';
import {
  BibleActions,
  BibleSecondaryCastingLayout,
  selectSecondaryTranslationSettings,
  selectSelectedBibleVerse,
  selectSelectedBook,
  selectSelectedChapterSections,
  selectSelectedSecondaryTranslationSections,
  selectSelectedVersesRange,
  selectCastingProcess,
  selectCastingProcessNavigate,
  selectCastingPaused,
} from '@lyri-cast/bible-store';
import { LyriFitTextDirective } from '@lyri-cast/common-browser';

@Component({
  selector: 'lyri-bible-casting-preview',
  standalone: true,
  imports: [CommonModule, LyriFitTextDirective],
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
  private sanitizer = inject(DomSanitizer);
  protected readonly appearanceService = inject(CastingAppearanceService);
  protected readonly appearance = this.appearanceService.appearanceFor('bible');

  deckRef?: Reveal.Api;
  deck?: Reveal.Api;

  fitTexts = viewChildren(LyriFitTextDirective);
  private resizeFrameId: number | null = null;

  castingProcess = toSignal(this.store.select(selectCastingProcess));
  castingNavigate = toSignal(this.store.select(selectCastingProcessNavigate));
  castingPaused = toSignal(this.store.select(selectCastingPaused), { initialValue: true });

  selectedVerse = toSignal(this.store.select(selectSelectedBibleVerse));
  selectedBook = toSignal(this.store.select(selectSelectedBook));
  selectedRange = toSignal(this.store.select(selectSelectedVersesRange));
  sections = toSignal(this.store.select(selectSelectedChapterSections), { initialValue: [] as BibleChapterSection[] });
  secondarySettings = toSignal(this.store.select(selectSecondaryTranslationSettings));
  secondarySections = toSignal(this.store.select(selectSelectedSecondaryTranslationSections), { initialValue: [] as BibleChapterSection[] });

  selectedBibleVerseForCast = computed(() => {
    const process = this.castingProcess();
    const navigate = this.castingNavigate();
    const paused = this.castingPaused();

    if (process && !paused) {
      if (navigate) {
        return {
          ...navigate.currentContent,
          text: [navigate.currentContent.text.join(' ')],
        } as BibleVerseForCasting;
      }

      const activeContent = process.content.find(v => v.number === process.fromIndex);
      if (activeContent) {
        return {
          ...activeContent,
          text: [activeContent.text.join(' ')],
        } as BibleVerseForCasting;
      }
    }

    const verse = this.selectedVerse();
    const book = this.selectedBook();
    if (!verse || !book) return null;
    return {
      ...verse,
      text: [verse.text],
      bookTitle: book.title,
    } as BibleVerseForCasting;
  });

  slideText = computed<SafeHtml>(() => {
    const process = this.castingProcess();
    const navigate = this.castingNavigate();
    const paused = this.castingPaused();

    let rawText = '';
    if (process && !paused) {
      let primaryVerses: BibleVerseForCasting[] = [];
      const range = navigate?.range ?? process.range ?? null;
      const fromIndex = navigate?.nextIndex ?? process.fromIndex;

      if (navigate && navigate.versesInRange?.length) {
        primaryVerses = this.prepareContentForDisplay(navigate.versesInRange, range, fromIndex);
      } else if (navigate) {
        primaryVerses = [navigate.currentContent];
      } else {
        primaryVerses = this.prepareContentForDisplay(process.content, range, fromIndex);
      }

      if (primaryVerses.length > 0) {
        rawText = primaryVerses.flatMap(v => v.text).join(' ');
      }
    } else {
      const verse = this.selectedVerse();
      const sections = this.sections();
      const range = this.selectedRange();
      if (verse) {
        rawText = this.buildSlideText(sections, range ?? null, verse.number, verse.text as unknown as string);
      }
    }
    return this.sanitizer.bypassSecurityTrustHtml(rawText);
  });

  secondaryLayout = computed<BibleSecondaryCastingLayout>(() => this.secondarySettings()?.layout ?? 'right');
  secondarySizePercent = computed(() => this.secondarySettings()?.sizePercent ?? 50);
  secondaryTranslateTitle = computed(() => {
    const s = this.secondarySettings();
    if (!s?.enabled) return '';

    const process = this.castingProcess();
    const navigate = this.castingNavigate();
    const paused = this.castingPaused();
    
    if (process && !paused) {
      const secondaryContent = navigate?.secondaryContent ?? process.secondaryContent;
      return secondaryContent ? (secondaryContent.translate.title || secondaryContent.translate.sourceTitle) : '';
    }

    return s.translate ? (s.translate.title || s.translate.sourceTitle) : '';
  });

  secondarySlideText = computed<SafeHtml | null>(() => {
    const s = this.secondarySettings();
    if (!s?.enabled) return null;

    const process = this.castingProcess();
    const navigate = this.castingNavigate();
    const paused = this.castingPaused();

    let rawText = '';
    if (process && !paused) {
      const secondaryContent = navigate?.secondaryContent ?? process.secondaryContent;
      if (secondaryContent) {
        const range = navigate?.range ?? process.range ?? null;
        const fromIndex = navigate?.nextIndex ?? process.fromIndex;

        const secondaryVerses = this.prepareContentForDisplay(secondaryContent.content, range, fromIndex);
        if (secondaryVerses.length > 0) {
          rawText = secondaryVerses.flatMap(v => v.text).join(' ');
        }
      }
    } else {
      const primarySections = this.sections();
      const secondarySections = this.secondarySections();
      const range = this.selectedRange();
      const verse = this.selectedVerse();

      if (primarySections?.length && secondarySections?.length && verse) {
        rawText = this.buildSecondarySlideText(primarySections, secondarySections, range ?? null, verse.number);
      }
    }

    return rawText ? this.sanitizer.bypassSecurityTrustHtml(rawText) : null;
  });

  stopCasting$ = this.actions.pipe(ofType(BibleActions.stopCasting));
  startCasting$ = this.actions.pipe(ofType(BibleActions.startCasting));

  constructor() {
    effect(() => {
      // Track dependencies to trigger redraw
      this.selectedBibleVerseForCast();
      this.slideText();
      this.secondaryLayout();
      this.secondarySizePercent();
      this.secondaryTranslateTitle();
      this.secondarySlideText();

      // Defer redraw to allow DOM to update first
      setTimeout(() => this.redrawPreview());
    });

    this.stopCasting$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.deckRef?.sync());

    this.startCasting$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.redrawPreview());
  }

  async ngAfterViewInit() {
    this.deckRef = new Reveal(this.elRef.nativeElement);
    this.deck = await this.deckRef.initialize({
      width: 400,
      height: 260,
      margin: -1,
      transition: 'fade',
      disableLayout: true,
      embedded: true,
      overview: false,
      keyboard: false,
    });
    this.redrawPreview();
  }

  sanitizeHtml(rawHtml: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(rawHtml);
  }

  hasSecondaryContent = computed(() => {
    const process = this.castingProcess();
    const navigate = this.castingNavigate();
    const paused = this.castingPaused();

    let rawText = '';
    if (process && !paused) {
      const secondaryContent = navigate?.secondaryContent ?? process.secondaryContent;
      if (secondaryContent) {
        const range = navigate?.range ?? process.range ?? null;
        const fromIndex = navigate?.nextIndex ?? process.fromIndex;

        const secondaryVerses = this.prepareContentForDisplay(secondaryContent.content, range, fromIndex);
        if (secondaryVerses.length > 0) {
          rawText = secondaryVerses.flatMap(v => v.text).join(' ');
        }
      }
    } else {
      const s = this.secondarySettings();
      const primarySections = this.sections();
      const secondarySections = this.secondarySections();
      const range = this.selectedRange();
      const verse = this.selectedVerse();

      if (s?.enabled && primarySections?.length && secondarySections?.length && verse) {
        rawText = this.buildSecondarySlideText(primarySections, secondarySections, range ?? null, verse.number);
      }
    }

    return rawText.trim().length > 0;
  });

  isSecondaryLayout(layout: BibleSecondaryCastingLayout): boolean {
    return this.secondaryLayout() === layout;
  }

  ngOnDestroy() {
    if (this.resizeFrameId !== null) {
      cancelAnimationFrame(this.resizeFrameId);
    }
    this.deck?.destroy?.();
  }

  private redrawPreview(): void {
    this.cdr.detectChanges();
    this.deckRef?.layout();
    this.deckRef?.sync();
    this.updateTextSize();
  }

  private updateTextSize(): void {
    if (this.resizeFrameId !== null) {
      cancelAnimationFrame(this.resizeFrameId);
    }

    this.resizeFrameId = requestAnimationFrame(() => {
      this.fitTexts().forEach((fitText) => {
        // @ts-ignore
        if (fitText.fit) fitText.fit();
      });
      this.resizeFrameId = null;
    });
  }

  private buildSecondarySlideText(
    primarySections: BibleChapterSection[],
    secondarySections: BibleChapterSection[],
    range: { from: number; to: number } | null,
    verseNumber: number
  ): string {
    const fromNumber = range?.from ?? verseNumber;
    const toNumber = range?.to ?? verseNumber;

    const primaryVerses = primarySections.flatMap(s => s.content);
    const secondaryVerses = secondarySections.flatMap(s => s.content);

    const versesInRange = secondaryVerses.filter(
      (verse) => verse.number >= fromNumber && verse.number <= toNumber
    );

    if (versesInRange.length > 1) {
      return versesInRange
        .map((verse) => this.buildVerseHtml(verse.number, verse.text as unknown as string))
        .join(' ');
    }

    if (versesInRange.length === 1) {
      return versesInRange[0].text as unknown as string;
    }

    return '';
  }

  private buildSlideText(
    sections: BibleChapterSection[],
    range: { from: number; to: number } | null,
    verseNumber: number,
    fallbackText: string
  ): string {
    const fromNumber = range?.from ?? verseNumber;
    const toNumber = range?.to ?? verseNumber;
    const versesInRange = sections
      .flatMap((section) => section.content)
      .filter(
        (verse) => verse.number >= fromNumber && verse.number <= toNumber
      );

    if (versesInRange.length > 1) {
      return versesInRange
        .map((verse) => this.buildVerseHtml(verse.number, verse.text))
        .join(' ');
    }

    if (versesInRange.length === 1) {
      return versesInRange[0].text;
    }

    return fallbackText;
  }

  private buildVerseHtml(verseNumber: number, text: string): string {
    const verseNumberStyle = [
      'color: var(--bible-verse-number-color)',
      'font-size: 0.7em',
      'font-weight: 400',
      'margin-right: 4px',
    ].join('; ');

    return `<span class="bible-casting__verse-number" style="${verseNumberStyle}">${verseNumber}</span> ${text}`;
  }

  private prepareContentForDisplay(
    content: BibleVerseForCasting[],
    range: { from: number; to: number } | null,
    fromIndex: number
  ): BibleVerseForCasting[] {
    if (range) {
      const versesInRange = content.filter(
        (verse) => verse.number >= range.from && verse.number <= range.to
      );

      if (versesInRange.length > 1) {
        const first = versesInRange[0];
        const combinedHtml = versesInRange
          .map((verse) => this.buildVerseHtml(verse.number, verse.text[0] || verse.text as unknown as string))
          .join(' ');

        return [{ ...first, text: [combinedHtml] }];
      }

      if (versesInRange.length === 1) {
        return versesInRange;
      }
    }

    const singleVerse = content.find((verse) => verse.number === fromIndex);
    return singleVerse ? [singleVerse] : [];
  }
}


