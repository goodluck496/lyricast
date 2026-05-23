import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import Reveal from 'reveal.js';

import {
  BibleChapterSection,
  BibleVerse,
  BibleVerseForCasting,
} from '@lyri-cast/entities';
import {
  CastingAppearanceService,
  LyriFitTextDirective,
} from '@lyri-cast/common-browser';
import {
  BibleActions,
  BibleSecondaryCastingLayout,
  selectCastingPaused,
  selectCastingProcess,
  selectCastingProcessNavigate,
  selectSecondaryTranslationSettings,
  selectSelectedBibleVerse,
  selectSelectedBook,
  selectSelectedChapterSections,
  selectSelectedSecondaryTranslationSections,
  selectSelectedVersesRange,
} from '@lyri-cast/bible-store';

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
  deckRef?: Reveal.Api;
  deck?: Reveal.Api;
  fitTexts = viewChildren(LyriFitTextDirective);
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

      const activeContent = process.content.find(
        (v) => v.number === process.fromIndex
      );
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
  secondaryLayout = computed<BibleSecondaryCastingLayout>(
    () => this.secondarySettings()?.layout ?? 'right'
  );
  secondarySizePercent = computed(
    () => this.secondarySettings()?.sizePercent ?? 50
  );
  secondaryTranslateTitle = computed(() => {
    const s = this.secondarySettings();
    if (!s?.enabled) return '';

    const process = this.castingProcess();
    const navigate = this.castingNavigate();
    const paused = this.castingPaused();

    if (process && !paused) {
      const secondaryContent =
        navigate?.secondaryContent ?? process.secondaryContent;
      return secondaryContent
        ? secondaryContent.translate.title ||
            secondaryContent.translate.sourceTitle
        : '';
    }

    return s.translate ? s.translate.title || s.translate.sourceTitle : '';
  });
  hasSecondaryContent = computed(() => {
    const s = this.secondarySettings();
    if (!s?.enabled) {
      return false;
    }

    const process = this.castingProcess();
    const navigate = this.castingNavigate();
    const paused = this.castingPaused();

    let rawText = '';
    if (process && !paused) {
      const secondaryContent =
        navigate?.secondaryContent ?? process.secondaryContent;
      if (secondaryContent) {
        const range = navigate?.range ?? process.range ?? null;
        const fromIndex = navigate?.nextIndex ?? process.fromIndex;

        const secondaryVerses = this.prepareContentForDisplay(
          secondaryContent.content,
          range,
          fromIndex
        );
        if (secondaryVerses.length > 0) {
          rawText = secondaryVerses.flatMap((v) => v.text).join(' ');
        }
      }
    } else {
      const secondarySections = this.secondarySections();
      const range = this.selectedRange();
      const verse = this.selectedVerse();

      if (secondarySections?.length && verse) {
        rawText = this.buildSecondarySlideText(
          secondarySections,
          range ?? null,
          verse.number
        );
      }
    }

    return rawText.trim().length > 0;
  });
  protected readonly appearanceService = inject(CastingAppearanceService);
  protected readonly appearance = this.appearanceService.appearanceFor('bible');
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private store = inject(Store);
  castingProcess = toSignal(this.store.select(selectCastingProcess));
  castingNavigate = toSignal(this.store.select(selectCastingProcessNavigate));
  castingPaused = toSignal(this.store.select(selectCastingPaused), {
    initialValue: true,
  });
  selectedVerse = toSignal(this.store.select(selectSelectedBibleVerse));
  selectedBook = toSignal(this.store.select(selectSelectedBook));
  selectedRange = toSignal(this.store.select(selectSelectedVersesRange));
  sections = toSignal(this.store.select(selectSelectedChapterSections), {
    initialValue: [] as BibleChapterSection[],
  });
  secondarySettings = toSignal(
    this.store.select(selectSecondaryTranslationSettings)
  );
  secondarySections = toSignal(
    this.store.select(selectSelectedSecondaryTranslationSections),
    { initialValue: [] as BibleChapterSection[] }
  );
  private actions = inject(Actions);
  stopCasting$ = this.actions.pipe(ofType(BibleActions.stopCasting));
  startCasting$ = this.actions.pipe(ofType(BibleActions.startCasting));
  private sanitizer = inject(DomSanitizer);
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
        primaryVerses = this.prepareContentForDisplay(
          navigate.versesInRange,
          range,
          fromIndex
        );
      } else if (navigate) {
        primaryVerses = [navigate.currentContent];
      } else {
        primaryVerses = this.prepareContentForDisplay(
          process.content,
          range,
          fromIndex
        );
      }

      if (primaryVerses.length > 0) {
        rawText = primaryVerses.flatMap((v) => v.text).join(' ');
      }
    } else {
      const verse = this.selectedVerse();
      const sections = this.sections();
      const range = this.selectedRange();
      if (verse) {
        rawText = this.buildSlideText(
          sections,
          range ?? null,
          verse.number,
          verse.text as unknown as string
        );
      }
    }
    return this.sanitizer.bypassSecurityTrustHtml(rawText);
  });
  secondarySlideText = computed<SafeHtml | null>(() => {
    const s = this.secondarySettings();
    if (!s?.enabled) return null;

    const process = this.castingProcess();
    const navigate = this.castingNavigate();
    const paused = this.castingPaused();

    let rawText = '';
    if (process && !paused) {
      const secondaryContent =
        navigate?.secondaryContent ?? process.secondaryContent;
      if (secondaryContent) {
        const range = navigate?.range ?? process.range ?? null;
        const fromIndex = navigate?.nextIndex ?? process.fromIndex;

        const secondaryVerses = this.prepareContentForDisplay(
          secondaryContent.content,
          range,
          fromIndex
        );
        if (secondaryVerses.length > 0) {
          rawText = secondaryVerses.flatMap((v) => v.text).join(' ');
        }
      }
    } else {
      const secondarySections = this.secondarySections();
      const range = this.selectedRange();
      const verse = this.selectedVerse();

      if (secondarySections?.length && verse) {
        rawText = this.buildSecondarySlideText(
          secondarySections,
          range ?? null,
          verse.number
        );
      }
    }

    return rawText ? this.sanitizer.bypassSecurityTrustHtml(rawText) : null;
  });
  private resizeFrameId: number | null = null;
  private redrawFrameId: number | null = null;

  constructor() {
    effect(() => {
      // Track dependencies to trigger redraw
      this.selectedBibleVerseForCast();
      this.slideText();
      this.secondaryLayout();
      this.secondarySizePercent();
      this.secondaryTranslateTitle();
      this.secondarySlideText();

      // Defer redraw using requestAnimationFrame instead of setTimeout to avoid macro task lag
      if (this.redrawFrameId !== null) {
        cancelAnimationFrame(this.redrawFrameId);
      }
      this.redrawFrameId = requestAnimationFrame(() => {
        this.redrawPreview();
        this.redrawFrameId = null;
      });
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

  isSecondaryLayout(layout: BibleSecondaryCastingLayout): boolean {
    return this.secondaryLayout() === layout;
  }

  ngOnDestroy() {
    if (this.resizeFrameId !== null) {
      cancelAnimationFrame(this.resizeFrameId);
    }
    if (this.redrawFrameId !== null) {
      cancelAnimationFrame(this.redrawFrameId);
    }
    this.deck?.destroy?.();
  }

  private redrawPreview(): void {
    this.cdr.detectChanges();
    this.deckRef?.sync();
  }

  private updateTextSize(): void {
    // Left empty or unused, LyriFitTextDirective manages fit text lifecycle automatically.
  }

  private buildSecondarySlideText(
    secondarySections: BibleChapterSection[],
    range: { from: number; to: number } | null,
    verseNumber: number
  ): string {
    const fromNumber = range?.from ?? verseNumber;
    const toNumber = range?.to ?? verseNumber;

    const versesInRange: BibleVerse[] = [];
    for (const s of secondarySections) {
      for (const v of s.content) {
        if (v.number >= fromNumber && v.number <= toNumber) {
          versesInRange.push(v);
        }
      }
    }

    if (versesInRange.length > 1) {
      return versesInRange
        .map((verse) =>
          this.buildVerseHtml(verse.number, verse.text as unknown as string)
        )
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

    const versesInRange: BibleVerse[] = [];
    for (const s of sections) {
      for (const v of s.content) {
        if (v.number >= fromNumber && v.number <= toNumber) {
          versesInRange.push(v);
        }
      }
    }

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
          .map((verse) =>
            this.buildVerseHtml(
              verse.number,
              verse.text[0] || (verse.text as unknown as string)
            )
          )
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
