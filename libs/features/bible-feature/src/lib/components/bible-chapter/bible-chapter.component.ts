import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgScrollbar } from 'ngx-scrollbar';
import { BibleChapterSection, BibleVerse } from '@lyri-cast/entities';
import { Store } from '@ngrx/store';
import {
  BibleActions,
  selectSelectedBibleVerse,
  selectSelectedPath,
  selectSelectedPrevOrNextVerse,
  selectSelectedVersesRange,
} from '@lyri-cast/bible-store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';
import { DomHandler } from 'primeng/dom';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TourPrimeNgModule } from 'ngx-ui-tour-primeng';
import { BibleOnboardingService } from '../../services/bible-onboarding.service';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ButtonModule } from 'primeng/button';
import { HighlighterPipe } from '@lyri-cast/ui-lib';

@Component({
  selector: 'lyri-bible-chapter',
  standalone: true,
  imports: [
    NgScrollbar,
    TourPrimeNgModule,
    FormsModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ButtonModule,
    HighlighterPipe,
  ],
  templateUrl: './bible-chapter.component.html',
  styleUrl: './bible-chapter.component.scss',
})
export class BibleChapterComponent implements OnInit {
  store = inject(Store);
  destroyRef = inject(DestroyRef);
  elRef = inject(ElementRef);
  sanitizer = inject(DomSanitizer);
  listItems = viewChildren<ElementRef<HTMLElement>>('verseItem');
  searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  sections = input<BibleChapterSection[]>([]);
  startCasting = output<BibleVerse>();
  selectedVerse = signal<BibleVerse | null>(null);
  selectedVerse$ = this.store.select(selectSelectedBibleVerse);
  selectedPrevOrNextVerse$ = this.store.select(selectSelectedPrevOrNextVerse);
  selectedPath$ = this.store.select(selectSelectedPath);
  selectedRange = signal<{ from: number; to: number } | null>(null);
  selectedRange$ = this.store.select(selectSelectedVersesRange);
  isScrolled = false;

  searchQuery = signal<string>('');
  isHovered = signal<boolean>(false);
  isSearchFocused = signal<boolean>(false);
  isFloatingBarVisible = computed(
    () =>
      this.isHovered() ||
      this.isSearchFocused() ||
      !!this.searchQuery().trim()
  );
  isNumberQuery = computed(() => /^\d+$/.test(this.searchQuery().trim()));
  activeMatchIndex = signal<number>(0);

  allVerses = computed<BibleVerse[]>(() => {
    const list: BibleVerse[] = [];
    for (const sec of this.sections()) {
      if (sec.content) {
        list.push(...sec.content);
      }
    }
    return list;
  });

  textMatches = computed<BibleVerse[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query || this.isNumberQuery()) {
      return [];
    }
    return this.allVerses().filter((v) =>
      v.text.toLowerCase().includes(query)
    );
  });

  currentMatchDisplayIndex = computed(() => {
    const total = this.textMatches().length;
    if (total === 0) return 0;
    const idx = this.activeMatchIndex();
    return (idx % total) + 1;
  });
  private readonly bibleOnboarding = inject(BibleOnboardingService);
  private scrollRetryTimer: any = null;
  private scrollRetryCount = 0;
  private readonly scrollRetryMax = 10;
  private scrollTimeout: any;

  // Функция для санитизации HTML
  sanitizeHtml(rawHtml: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(rawHtml);
  }

  ngOnInit() {
    this.selectedVerse$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.selectedVerse.set(value);
        this.scrollRetryCount = 0;
        this.scrollToSelected();
      });
    this.selectedPrevOrNextVerse$
      .pipe(takeUntilDestroyed(this.destroyRef), filterEmpty())
      .subscribe((value) => {
        this.sections().forEach((sec) => {
          const foundVerse = sec.content.find(
            (el) => el.path.toString() === value.path.toString()
          );
          if (foundVerse) {
            this.selectedVerse.set(foundVerse);

            this.scrollRetryCount = 0;

            this.scrollToSelected();
          }
        });
      });

    this.selectedPath$
      .pipe(takeUntilDestroyed(this.destroyRef), debounceTime(0))
      .subscribe((path) => {
        this.selectVerse(path);
      });

    this.selectedRange$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((range) => {
        this.selectedRange.set(range);
      });
  }

  selectVerse(path: string[]) {
    if (path.length !== 3) {
      return;
    }

    this.elRef.nativeElement.focus();

    const verseId = path[path.length - 1];
    if (this.selectedVerse()?.number.toString() === verseId) {
      return;
    }

    this.sections().forEach((section) => {
      section.content.forEach((sectionContent) => {
        if (sectionContent.number.toString() === verseId) {
          this.selectedVerse.set(sectionContent);
        }
      });
    });
  }

  scrollToSelected() {
    if (this.isScrolled) {
      return;
    }
    this.isScrolled = true;

    const tryScroll = () => {
      let found = false;

      for (const item of this.listItems()) {
        if (
          DomHandler.hasClass(
            item.nativeElement,
            'bible-chapter-section__verse--selected'
          )
        ) {
          found = true;
          if (typeof item.nativeElement.scrollIntoView === 'function') {
            item.nativeElement.scrollIntoView({
              block: 'center',
              behavior: 'smooth',
            });
          }
          break;
        }
      }

      // Всегда сбрасываем флаг, иначе он может "залипнуть" если элемент еще не отрендерился.
      this.isScrolled = false;

      if (!found && this.scrollRetryCount < this.scrollRetryMax) {
        this.scrollRetryCount += 1;
        this.scrollRetryTimer = setTimeout(() => {
          // если за это время выбранный стих сменился — новые подписки сбросят счетчик
          this.scrollToSelected();
        }, 50);
      }
    };

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // Ждем рендер и применение класса selected. Даем задержку 300мс чтобы дать время на даблклик
    this.scrollTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        tryScroll();
      });
    }, 300);
  }

  isInRange(verseNumber: number): boolean {
    const range = this.selectedRange();
    if (!range) {
      return false;
    }

    return verseNumber >= range.from && verseNumber <= range.to;
  }

  onSelectVerse(verse: BibleVerse, mouseEvent?: MouseEvent, casting = false) {
    const shiftPressed = !!mouseEvent?.shiftKey;

    if (shiftPressed) {
      const current = this.selectedVerse();
      const from = current
        ? Math.min(current.number, verse.number)
        : verse.number;
      const to = current
        ? Math.max(current.number, verse.number)
        : verse.number;

      this.store.dispatch(BibleActions.selectVersesRange({ from, to }));
    } else {
      this.store.dispatch(
        BibleActions.selectVersesRange({
          from: verse.number,
          to: verse.number,
        })
      );
    }

    this.store.dispatch(BibleActions.selectBibleVerse(verse));

    if (shiftPressed) {
      this.bibleOnboarding.tryNext('bible:shift');
    }

    if (casting) {
      this.startCasting.emit(verse);
    }
  }

  scrollToVerse(verse: BibleVerse) {
    const el = this.listItems().find(
      (item) =>
        item.nativeElement.getAttribute('data-verse-number') ===
        String(verse.number)
    );
    if (el?.nativeElement && typeof el.nativeElement.scrollIntoView === 'function') {
      el.nativeElement.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }
  }

  selectVerseByNumber(verseNumber: number) {
    const found = this.allVerses().find((v) => v.number === verseNumber);
    if (found) {
      this.onSelectVerse(found);
      this.scrollToVerse(found);
    }
  }

  onSearchInput(value: string) {
    this.searchQuery.set(value);
    const trimmed = value.trim();
    if (!trimmed) {
      this.activeMatchIndex.set(0);
      return;
    }

    if (this.isNumberQuery()) {
      const num = parseInt(trimmed, 10);
      this.selectVerseByNumber(num);
    } else {
      this.activeMatchIndex.set(0);
      const matches = this.textMatches();
      if (matches.length > 0) {
        this.scrollToVerse(matches[0]);
      }
    }
  }

  nextMatch() {
    const matches = this.textMatches();
    if (matches.length === 0) return;
    const nextIdx = (this.activeMatchIndex() + 1) % matches.length;
    this.activeMatchIndex.set(nextIdx);
    this.scrollToVerse(matches[nextIdx]);
  }

  prevMatch() {
    const matches = this.textMatches();
    if (matches.length === 0) return;
    const prevIdx =
      (this.activeMatchIndex() - 1 + matches.length) % matches.length;
    this.activeMatchIndex.set(prevIdx);
    this.scrollToVerse(matches[prevIdx]);
  }

  clearSearch() {
    this.searchQuery.set('');
    this.activeMatchIndex.set(0);
    const inputEl = this.searchInputRef()?.nativeElement;
    if (inputEl) {
      inputEl.value = '';
    }
  }

  onSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.isNumberQuery()) {
        const num = parseInt(this.searchQuery().trim(), 10);
        this.selectVerseByNumber(num);
      } else {
        if (event.shiftKey) {
          this.prevMatch();
        } else {
          this.nextMatch();
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.clearSearch();
      if (event.target instanceof HTMLElement) {
        event.target.blur();
      }
      this.isSearchFocused.set(false);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest(
          'input, textarea, [contenteditable="true"], .p-dialog, .p-popover, .p-dropdown-panel, .p-select-panel'
        ))
    ) {
      return;
    }

    if (!/^[\p{L}\p{N}]$/u.test(event.key)) {
      return;
    }

    event.preventDefault();
    const current = this.searchQuery();
    const nextQuery = current ? current + event.key : event.key;
    this.onSearchInput(nextQuery);

    const inputEl = this.searchInputRef()?.nativeElement;
    if (inputEl) {
      inputEl.value = nextQuery;
      inputEl.focus();
      inputEl.setSelectionRange(nextQuery.length, nextQuery.length);
    }
  }
}
