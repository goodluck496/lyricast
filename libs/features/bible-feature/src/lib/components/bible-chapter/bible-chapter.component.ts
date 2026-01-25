import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChildren,
} from '@angular/core';

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

@Component({
  selector: 'lyri-bible-chapter',
  standalone: true,
  imports: [NgScrollbar, TourPrimeNgModule],
  templateUrl: './bible-chapter.component.html',
  styleUrl: './bible-chapter.component.scss',
})
export class BibleChapterComponent implements OnInit {
  store = inject(Store);
  destroyRef = inject(DestroyRef);
  elRef = inject(ElementRef);
  sanitizer = inject(DomSanitizer);
  private readonly bibleOnboarding = inject(BibleOnboardingService);
  listItems = viewChildren<ElementRef<HTMLElement>>('verseItem');

  sections = input<BibleChapterSection[]>([]);

  startCasting = output();

  selectedVerse = signal<BibleVerse | null>(null);
  selectedVerse$ = this.store.select(selectSelectedBibleVerse);
  selectedPrevOrNextVerse$ = this.store.select(selectSelectedPrevOrNextVerse);
  selectedPath$ = this.store.select(selectSelectedPath);

  selectedRange = signal<{ from: number; to: number } | null>(null);
  selectedRange$ = this.store.select(selectSelectedVersesRange);

  isScrolled = false;

  private scrollRetryTimer: any = null;
  private scrollRetryCount = 0;
  private readonly scrollRetryMax = 10;

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
          item.nativeElement.scrollIntoView({
            block: 'center',
            behavior: 'smooth',
          });
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

    // Ждем рендер и применение класса selected
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tryScroll();
      });
    });
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
      this.startCasting.emit();
    }
  }
}
