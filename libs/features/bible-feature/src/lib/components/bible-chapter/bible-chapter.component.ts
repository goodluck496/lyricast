import {
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgScrollbar } from 'ngx-scrollbar';
import {
  BibleChapterSection,
  BibleChapterSectionContent,
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

  selectVerse = output<BibleChapterSectionContent>();

  selectedVerse = signal<BibleChapterSectionContent | null>(null);
  selectedVerse$ = this.store.select(selectSelectedChapterSectionContent);
  selectedPath$ = this.store.select(selectSelectedPath);

  ngOnInit() {
    this.selectedVerse$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        console.log('selectedVerse$', value);
        this.selectedVerse.set(value);
      });

    this.selectedPath$
      .pipe(takeUntilDestroyed(this.destroyRef), debounceTime(0))
      .subscribe((value) => {
        if (value.length === 3) {
          if (
            this.selectedVerse()?.number.toString() === value[value.length - 1]
          ) {
            return;
          }

          this.sections().forEach((section) => {
            section.content.forEach((sectionContent) => {
              if (
                sectionContent.number.toString() ===
                value[value.length - 1].toString()
              ) {
                this.selectedVerse.set(sectionContent);
              }
            });
          });
        }
      });
  }

  onSelectVerse(verse: BibleChapterSectionContent) {
    this.store.dispatch(BibleActions.selectChapterSectionContent(verse));
    // this.selectedVerse = verse;
  }
}
