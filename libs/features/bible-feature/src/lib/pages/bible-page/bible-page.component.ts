import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BibleApiService } from '../../services/index';
import { HighlighterPipe, PageContainerComponent } from '@lyri-cast/ui-lib';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import {
  BibleBookShort,
  BibleBookType,
  BibleChapterSection,
  BibleChapterSectionContent,
  BibleChapterShort,
  BibleTranslateShort,
} from '@lyri-cast/entities';
import {
  debounceTime,
  map,
  Observable, startWith,
  switchMap,
  take,
  tap,
  withLatestFrom
} from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';
import { Store } from '@ngrx/store';
import { BibleState } from '../../store/bible.store';
import { BibleActions } from '../../store/bible.actions';
import {
  selectSelectedBook,
  selectSelectedChapterSection,
  selectSelectedPath,
  selectSelectedTranslate,
} from '../../store/bible.selectors';
import { ButtonDirective } from 'primeng/button';
import { BibleChapterComponent } from '../../components/bible-chapter/bible-chapter.component';
import {
  IUiLyriItemInList,
  IUiLyriListItem,
  ListBoxComponent,
  ListBoxTemplates,
} from '@lyri-cast/form';

@Component({
  selector: 'lyri-bible-page',
  standalone: true,
  imports: [
    CommonModule,
    PageContainerComponent,
    FormsModule,
    InputTextModule,
    DropdownModule,
    ReactiveFormsModule,
    ListBoxComponent,
    HighlighterPipe,
    ButtonDirective,
    BibleChapterComponent,
  ],
  templateUrl: './bible-page.component.html',
  styleUrl: './bible-page.component.scss',
})
export class BiblePageComponent implements AfterViewInit {
  cdr = inject(ChangeDetectorRef);
  apiSrv = inject(BibleApiService);
  store = inject<Store<BibleState>>(Store<BibleState>);

  searchSig = signal<string>('');

  bibleTranslateControl =
    new FormControl<IUiLyriListItem<BibleTranslateShort> | null>(null);
  bibleBookControl = new FormControl<IUiLyriListItem<BibleBookShort> | null>(
    null
  );
  chapterControl = new FormControl<IUiLyriListItem<BibleChapterShort> | null>(
    null
  );

  bibleTranslates$: Observable<IUiLyriListItem<BibleTranslateShort>[]> =
    this.apiSrv.getTranslates().pipe(
      map((data) =>
        data.map(
          (el) =>
            ({
              title: el.title || el.sourceTitle,
              searchKey: el.keyForSearch,
              baseEntity: el,
            } satisfies IUiLyriListItem<BibleTranslateShort>)
        )
      )
    );
  bibleTranslates: IUiLyriListItem<BibleTranslateShort>[] = [];

  bookList$: Observable<IUiLyriItemInList<BibleBookShort>[]> = this.store
    .select(selectSelectedTranslate)
    .pipe(
      filterEmpty(),
      switchMap((value) => {
        return this.apiSrv.getBooks(value);
      }),
      map((data) => {
        return data.map((el) => {
          return {
            title: el.title.full,
            searchKey: String(el.number),
            baseEntity: el,
          } satisfies IUiLyriItemInList<BibleBookShort>;
        });
      }),
      tap(() => {
        this.bibleBookControl.setValue(null);
        this.chapterControl.setValue(null);
      })
    );

  chapterList$: Observable<IUiLyriItemInList<BibleChapterShort>[]> = this.store
    .select(selectSelectedBook)
    .pipe(
      map((data) => {
        if (!data) {
          return [];
        }
        return data.chapters.map(
          (el: BibleChapterShort) =>
            ({
              title: el.title,
              searchKey: String(el.number),
              baseEntity: el,
            } satisfies IUiLyriItemInList<BibleChapterShort>)
        );
      })
    );

  sectionList$: Observable<BibleChapterSection[]> = this.store.select(
    selectSelectedChapterSection
  );

  constructor() {
    this.bibleTranslateControl.valueChanges
      .pipe(filterEmpty())
      .subscribe((value) => {
        const translate = (value && value.baseEntity) || null;
        if (!translate) {
          return;
        }
        this.store.dispatch(BibleActions.selectTranslate({ translate }));
      });

    this.bibleBookControl.valueChanges
      .pipe(filterEmpty())
      .subscribe((value) => {
        const book = (value && value.baseEntity) || null;
        this.store.dispatch(BibleActions.selectBook({ book }));
      });

    this.chapterControl.valueChanges.pipe(filterEmpty()).subscribe((value) => {
      this.store.dispatch(
        BibleActions.selectChapter({ chapter: value.baseEntity })
      );
    });

    this.store
      .select(selectSelectedPath)
      .pipe(
        startWith(['1', '1', '1']),
        withLatestFrom(this.bookList$, this.chapterList$, this.sectionList$),
        debounceTime(10)
      )
      .subscribe(([path, books, chapters, sections]) => {
        if (path.length === 1) {
          this.chapterControl.setValue(chapters[0]);
          console.log('select chapter');
          // this.store.dispatch(BibleActions.changePath())
        }

        console.log('--------');
        if (path.length === 3) {
          console.log('path', path);
          const book = books.find((book) => book.searchKey === path[0]);
          const chapter = chapters.find(
            (chapter) => chapter.searchKey === path[1]
          );
          //
          // if (book) {
          //   this.bibleBookControl.setValue(book, {emitEvent: false});
          // }
          //
          // if(chapter) {
          //   this.chapterControl.setValue(chapter, {emitEvent: false});
          // }
        }

        console.log('path', path, chapters.length);
      });
  }

  ngAfterViewInit() {
    this.bibleTranslates$.pipe().subscribe((data) => {
      this.bibleTranslates = [...data];
      const translate = data.find((el) =>
        el.searchKey.toLowerCase().includes('syno')
      );
      if (!translate) {
        return;
      }
      this.bibleTranslateControl.setValue(translate);
      this.bibleBookControl.setValue(null);
    });
  }

  public onSearch(value: string) {
    console.log('search', value);
  }

  onStartCasting() {
    this.sectionList$.pipe(take(1)).subscribe((data) => {
      if (this.bibleBookControl.value && this.chapterControl.value) {
        this.store.dispatch(
          BibleActions.openCasting({
            book: this.bibleBookControl.value.baseEntity,
            chapter: this.chapterControl.value.baseEntity,
            fromIndex: 0,
            content: data[0].content.map((el) => {
              return {
                ...el,
                text: [el.text],
              };
            }),
          })
        );
      }
    });
  }

  protected readonly ListBoxTemplates = ListBoxTemplates;
  protected readonly BibleBookType = BibleBookType;
}
