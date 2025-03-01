import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  signal,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgScrollbar } from 'ngx-scrollbar';
import { BibleChapterSection, BibleVerse } from '@lyri-cast/entities';
import { Store } from '@ngrx/store';
import {
  selectSelectedBibleVerse,
  selectSelectedPath,
  selectSelectedPrevOrNextVerse,
} from '../../store/bible.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { BibleActions } from '../../store/bible.actions';
import { filterEmpty } from '@lyri-cast/common';
import { DomHandler } from 'primeng/dom';

@Component({
  selector: 'lyri-bible-chapter',
  standalone: true,
  imports: [CommonModule, NgScrollbar],
  templateUrl: './bible-chapter.component.html',
  styleUrl: './bible-chapter.component.scss',
})
export class BibleChapterComponent implements OnInit {
  store = inject(Store);
  destroyRef = inject(DestroyRef);
  elRef = inject(ElementRef);
  listItems = viewChildren<ElementRef<HTMLElement>>('verseItem');

  sections = input<BibleChapterSection[]>([]);

  selectedVerse = signal<BibleVerse | null>(null);
  selectedVerse$ = this.store.select(selectSelectedBibleVerse);
  selectedPrevOrNextVerse$ = this.store.select(selectSelectedPrevOrNextVerse);
  selectedPath$ = this.store.select(selectSelectedPath);

  constructor() {
    effect(() => {
      this.scrollToSelected();
    });
  }

  ngOnInit() {
    this.selectedVerse$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.selectedVerse.set(value);
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

            this.scrollToSelected();
          }
        });
      });

    this.selectedPath$
      .pipe(takeUntilDestroyed(this.destroyRef), debounceTime(0))
      .subscribe((path) => {
        this.selectVerse(path);
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
    setTimeout(() => {
      this.listItems().forEach((item) => {
        if (
          DomHandler.hasClass(
            item.nativeElement,
            'bible-chapter-section__verse--selected'
          )
        ) {
          /**
           * работает хуже чем нативный scrollIntoView
           */
          // this.scrollBar().scrollToElement(item);
          item.nativeElement.scrollIntoView({
            block: 'center',
            behavior: 'smooth',
          });
        }
      });
    }, 1000);
  }

  onSelectVerse(verse: BibleVerse) {
    this.store.dispatch(BibleActions.selectBibleVerse(verse));
  }
}
