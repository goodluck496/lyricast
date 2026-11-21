import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
  viewChildren
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import Reveal, { Api } from 'reveal.js';

import { BibleBookShort, BibleVerseForCasting } from '@lyri-cast/entities';
import {
  BridgeService,
  CastingAppearanceService,
  LyriFitTextDirective,
  Pages,
  SettingsService,
} from '@lyri-cast/common-browser';
import { APP_COMMON_ACTIONS } from '@lyri-cast/common-electron';
import {
  BibleActions,
  BiblePresentationNavigatePayload,
  BibleSecondaryCastingLayout,
  BibleSecondaryDestination,
  BibleStartCastingPayload,
  selectCastingAppearance,
  selectCastingPaused,
  selectCastingProcess,
  selectCastingProcessNavigate,
  selectSecondaryTranslationSettings
} from '@lyri-cast/bible-store';

@Component({
  selector: 'lyri-bible-casting-page',
  standalone: true,
  imports: [CommonModule, LyriFitTextDirective],
  templateUrl: './bible-casting.component.html',
  styleUrl: './bible-casting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleCastingComponent implements OnInit, AfterViewInit, OnDestroy {
  isMainWindow = input(false);
  deckRef?: Reveal.Api;
  selectedBookTitle = signal('');
  selectedBook = signal<BibleBookShort | null>(null);
  selectedChapterId = signal<number | null>(null);
  selectedContents = signal<BibleVerseForCasting[]>([]);
  selectedVerseId = signal<number>(1);
  selectedRange = signal<{ from: number; to: number } | null>(null);
  secondaryContents = signal<BibleVerseForCasting[]>([]);
  secondaryTranslateTitle = signal('');
  secondaryEnabled = signal(false);
  secondaryLayout = signal<BibleSecondaryCastingLayout>('right');
  secondarySizePercent = signal(50);
  secondaryDestination = signal<BibleSecondaryDestination>('split');
  private readonly route = inject(ActivatedRoute);
  private readonly settingsSrv = inject(SettingsService);
  readonly isSecondaryOnly = signal(false);

  primaryLine = computed(() => {
    return this.selectedContents()[0]?.text[0] ?? '';
  });
  secondaryLine = computed(() => this.secondaryContents()[0]?.text[0] ?? '');
  displayedLine = computed(() => {
    if (this.isSecondaryOnly()) {
      return this.secondaryLine() || this.primaryLine();
    }
    return this.primaryLine();
  });
  showingContent = signal(false);
  fitTexts = viewChildren(LyriFitTextDirective);
  protected readonly appearanceService = inject(CastingAppearanceService);
  protected readonly appearance = this.appearanceService.appearanceFor('bible');
  private readonly destroyRef = inject(DestroyRef);
  private readonly bridge = inject(BridgeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly store = inject(Store);
  castingPaused$ = this.store.select(selectCastingPaused);
  private readonly sanitizer = inject(DomSanitizer);
  private revealInitialized = false;
  private resizeFrameId: number | null = null;
  private currentCastingPayload: BibleStartCastingPayload | null = null;

  @HostListener('window:resize')
  resizeHandler() {
    if (!this.deckRef) {
      return;
    }

    this.deckRef.layout();
    this.updateTextSize();
  }

  @HostListener('window:keydown', ['$event'])
  keydownHandler(event: KeyboardEvent) {
    if (!this.deckRef || !this.showingContent()) {
      return;
    }

    if (['ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      this.navigateLocalVerse('next');
      return;
    }

    if (['ArrowLeft', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      this.navigateLocalVerse('prev');
    }
  }

  sanitizeHtml(rawHtml: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(rawHtml);
  }

  ngOnInit() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.isSecondaryOnly.set(params.get('role') === 'secondary_bible');
      });

    this.castingPaused$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.showingContent.set(!value);
      });

    this.store
      .select(selectCastingProcess)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        if (data) {
          this.startCastingHandler(data);
        }
      });

    this.store
      .select(selectCastingProcessNavigate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        if (data) {
          this.navigateCastingHandler(data);
        }
      });

    this.store
      .select(selectCastingAppearance)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((appearance) => {
        this.appearanceService.set(appearance, 'bible');
        this.redrawDeck();
      });

    this.store
      .select(selectSecondaryTranslationSettings)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings) => {
        this.secondaryEnabled.set(settings.enabled);
        this.secondaryLayout.set(settings.layout);
        this.secondarySizePercent.set(settings.sizePercent);
        this.secondaryDestination.set(settings.destination || 'split');

        if (!settings.enabled) {
          this.secondaryContents.set([]);
        }

        this.redrawDeck();
      });
  }

  async ngAfterViewInit() {
    await this.initReveal();

    if (this.isMainWindow()) {
      return;
    }

    this.bridge.windowSrv.electronContext.send({
      event: APP_COMMON_ACTIONS.openedPage,
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  ngOnDestroy() {
    if (this.resizeFrameId !== null) {
      cancelAnimationFrame(this.resizeFrameId);
    }
    this.deckRef?.destroy();
  }

  startCastingHandler(payload: BibleStartCastingPayload) {
    this.clearSlides();
    this.currentCastingPayload = payload;
    this.appearanceService.set(
      payload.appearance ?? this.appearance(),
      'bible'
    );
    this.applySecondarySettingsFromPayload(payload);

    const range = payload.range ?? null;
    const primaryContents = this.prepareContentForDisplay(
      payload.content,
      range,
      payload.fromIndex
    );

    this.selectedBook.set(payload.book);
    this.selectedBookTitle.set(payload.book.title.full);
    this.selectedChapterId.set(payload.chapter.number);
    this.selectedRange.set(
      this.hasMultiVerseRange(payload.content, range) ? range : null
    );
    this.selectedContents.set(primaryContents);
    this.selectedVerseId.set(primaryContents[0]?.number ?? payload.fromIndex);
    this.applySecondaryContent(payload);

    this.showingContent.set(true);
    this.redrawDeck();
    this.deckRef?.slide(0, 0);
  }

  navigateCastingHandler(payload: BiblePresentationNavigatePayload) {
    if (!this.deckRef) {
      return;
    }

    if (payload.range && payload.versesInRange?.length) {
      this.selectedRange.set(
        payload.versesInRange.length > 1 ? payload.range : null
      );
      this.selectedContents.set(
        this.prepareContentForDisplay(
          payload.versesInRange,
          payload.range,
          payload.nextIndex
        )
      );
    } else {
      this.selectedRange.set(null);
      this.selectedContents.set([payload.currentContent]);
    }

    const currentContent = this.selectedContents()[0] ?? payload.currentContent;
    this.selectedBookTitle.set(currentContent.bookTitle.full);
    this.selectedChapterId.set(currentContent.chapterId);
    this.selectedVerseId.set(currentContent.number);
    this.applySecondaryContent(payload);
    this.redrawDeck();
  }

  async initReveal(): Promise<Api> {
    if (this.deckRef && this.revealInitialized) {
      return this.deckRef;
    }

    this.deckRef = new Reveal(this.elRef.nativeElement);

    const deck = await this.deckRef.initialize({
      margin: -1,
      disableLayout: true,
      transition: 'fade',
      center: true,
      embedded: true,
      progress: false,
      controls: false,
      overview: false,
    });

    this.revealInitialized = true;

    // sync slides immediately after initialization if content is already available
    if (this.showingContent()) {
      this.cdr.detectChanges();
      this.deckRef.sync();
      this.deckRef.slide(0, 0);

      // Принудительно запускаем пересчет размера шрифта после того, как Reveal.js стабилизирует DOM
      setTimeout(() => {
        this.fitTexts().forEach((dir) => dir.fit());
      }, 150);
    }

    return deck;
  }

  updateTextSize() {
    // Left empty, LyriFitTextDirective automatically manages refitting.
  }

  clearSlides(): void {
    this.showingContent.set(false);
    this.secondaryContents.set([]);
  }

  redrawDeck(): void {
    this.cdr.detectChanges();
    this.deckRef?.sync();
  }

  isSecondaryLayout(layout: BibleSecondaryCastingLayout): boolean {
    return this.secondaryLayout() === layout;
  }

  hasSecondaryContent(): boolean {
    if (this.isSecondaryOnly()) {
      return false;
    }
    if (this.secondaryDestination() === 'dedicated') {
      return false;
    }
    const hasDedicatedScreen = this.settingsSrv
      .getActiveChannels()
      .some((c) => c.role === 'secondary_bible');
    if (hasDedicatedScreen) {
      return false;
    }
    return this.secondaryEnabled() && this.secondaryContents().length > 0;
  }

  private applySecondaryContent(
    payload: BibleStartCastingPayload | BiblePresentationNavigatePayload
  ): void {
    const secondary = payload.secondaryContent;

    if (!this.secondaryEnabled() || !secondary) {
      this.secondaryContents.set([]);
      this.secondaryTranslateTitle.set('');
      return;
    }

    const fromIndex =
      'fromIndex' in payload ? payload.fromIndex : payload.nextIndex;

    this.secondaryTranslateTitle.set(
      secondary.translate.title || secondary.translate.sourceTitle
    );
    this.secondaryContents.set(
      this.prepareContentForDisplay(
        secondary.content,
        payload.range ?? null,
        fromIndex
      )
    );
  }

  private navigateLocalVerse(direction: 'next' | 'prev'): void {
    const payload = this.currentCastingPayload;

    if (!payload || this.selectedRange()) {
      return;
    }

    const currentNumber = this.selectedVerseId();
    const currentIndex = payload.content.findIndex(
      (verse) => verse.number === currentNumber
    );

    if (currentIndex < 0) {
      return;
    }

    const nextIndex =
      direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    const nextVerse = payload.content[nextIndex];

    if (!nextVerse) {
      return;
    }

    const nextPayload: BiblePresentationNavigatePayload = {
      currentContent: nextVerse,
      secondaryContent: payload.secondaryContent,
      nextIndex: nextVerse.number,
    };

    this.store.dispatch(BibleActions.castingProcessChange(nextPayload));
  }

  private applySecondarySettingsFromPayload(
    payload: BibleStartCastingPayload
  ): void {
    if (!payload.secondarySettings) {
      return;
    }

    this.secondaryEnabled.set(payload.secondarySettings.enabled);
    this.secondaryLayout.set(payload.secondarySettings.layout);
    this.secondarySizePercent.set(payload.secondarySettings.sizePercent);
    if (payload.secondarySettings.destination) {
      this.secondaryDestination.set(payload.secondarySettings.destination);
    }
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
          .map((verse) => this.buildVerseHtml(verse.number, verse.text))
          .join(' ');

        return [{ ...first, text: [combinedHtml] }];
      }

      if (versesInRange.length === 1) {
        return versesInRange;
      }
    }

    const single = content.find((verse) => verse.number === fromIndex);
    return single ? [single] : [];
  }

  private hasMultiVerseRange(
    content: BibleVerseForCasting[],
    range: { from: number; to: number } | null
  ): boolean {
    if (!range) {
      return false;
    }

    return (
      content.filter(
        (verse) => verse.number >= range.from && verse.number <= range.to
      ).length > 1
    );
  }

  private buildVerseHtml(verseNumber: number, textLines: string[]): string {
    const text = textLines.join(' ');
    const verseNumberStyle = [
      'color: var(--bible-verse-number-color)',
      'font-size: 0.7em',
      'font-weight: 400',
      'margin-right: 8px',
    ].join('; ');

    return `<span class="bible-casting__verse-number" style="${verseNumberStyle}">${verseNumber}</span> ${text}`;
  }
}
