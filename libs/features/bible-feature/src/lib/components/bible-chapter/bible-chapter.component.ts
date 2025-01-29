import {
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgScrollbar } from 'ngx-scrollbar';
import {
  BibleChapterSection,
  BibleVerse,
} from '@lyri-cast/entities';
import { Store } from '@ngrx/store';
import {
  selectSelectedChapterSectionContent,
  selectSelectedPath,
} from '../../store/bible.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { BibleActions } from '../../store/bible.actions';

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

  sections = input<BibleChapterSection[]>([]);

  selectedVerse = signal<BibleVerse | null>(null);
  selectedVerse$ = this.store.select(selectSelectedChapterSectionContent);
  selectedPath$ = this.store.select(selectSelectedPath);

  ngOnInit() {
    this.selectedVerse$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.selectedVerse.set(value);
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

  onSelectVerse(verse: BibleVerse) {
    this.store.dispatch(BibleActions.selectChapterSectionContent(verse));
  }
}
