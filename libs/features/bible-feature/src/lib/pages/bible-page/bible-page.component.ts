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
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import {
  BibleBookShort,
  BibleBookType,
  BibleChapterSection,
  BibleChapterShort,
  BibleTranslateShort,
} from '@lyri-cast/entities';
import {
  debounceTime,
  filter,
  map,
  Observable,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';
import { Store } from '@ngrx/store';
import { BibleState } from '../../store/bible.store';
import { BibleActions } from '../../store/bible.actions';
import {
  selectSelectedBook,
  selectSelectedChapterSections, selectSelectedChapterSectionContent,
  selectSelectedPath,
  selectSelectedTranslate
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

  bibleFormGroup = new FormGroup({
    translate: new FormControl<IUiLyriListItem<BibleTranslateShort> | null>(
      null
    ),
    book: new FormControl<IUiLyriListItem<BibleBookShort> | null>(null),
    chapter: new FormControl<IUiLyriListItem<BibleChapterShort> | null>(null),
    content: new FormControl(null),
  });

  disableFormEmitChange = false;

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
        this.bibleFormGroup.patchValue({ book: null, chapter: null });
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
    selectSelectedChapterSections
  );

  constructor() {
    this.bibleFormGroup.controls.translate.valueChanges
      .pipe(
        filterEmpty(),
        filter(() => !this.disableFormEmitChange)
      )
      .subscribe((value) => {
        const translate = (value && value.baseEntity) || null;
        if (!translate) {
          return;
        }
        this.store.dispatch(BibleActions.selectTranslate({ translate }));
      });

    this.bibleFormGroup.controls.book.valueChanges
      .pipe(
        filterEmpty(),
        filter(() => !this.disableFormEmitChange)
      )
      .subscribe((value) => {
        const book = (value && value.baseEntity) || null;
        this.store.dispatch(BibleActions.selectBook({ book }));
        this.store.dispatch(
          BibleActions.changePath({ path: [book.number.toString(), '1', '1'] })
        );
      });

    this.bibleFormGroup.controls.chapter.valueChanges
      .pipe(
        filterEmpty(),
        filter(() => !this.disableFormEmitChange)
      )
      .subscribe((value) => {
        this.store.dispatch(
          BibleActions.selectChapter({ chapter: value.baseEntity })
        );
      });

    this.store
      .select(selectSelectedPath)
      .pipe(
        withLatestFrom(this.bookList$, this.chapterList$),
        filter(() => !this.disableFormEmitChange),
        debounceTime(10)
      )
      .subscribe(([path, books, chapters]) => {
        if (path.length === 1) {
          this.bibleFormGroup.patchValue({ chapter: chapters[0] });
        }

        if (path.length === 3) {
          this.disableFormEmitChange = true;

          const book = books.find((book) => book.searchKey === path[0]);
          const chapter = chapters.find(
            (chapter) => chapter.searchKey === path[1]
          );

          this.bibleFormGroup.patchValue({
            book,
            chapter,
          });

          setTimeout(() => {
            this.disableFormEmitChange = false;
          });
        }
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
      this.bibleFormGroup.patchValue({
        translate,
        book: null,
      });
    });

    // setTimeout(() => {
    //   this.store.dispatch(BibleActions.changePath({ path: ['2', '15', '10'] }));
    // }, 2000);
  }

  public onSearch(value: string) {
    console.log('search', value);
  }

  onStartCasting() {

    this.store.select(selectSelectedChapterSectionContent).pipe(filterEmpty(), withLatestFrom(this.sectionList$)).subscribe(([verse, sections]) => {
      const groupValue = this.bibleFormGroup.value;

        if (groupValue.book && groupValue.chapter) {
          this.store.dispatch(
            BibleActions.openCasting({
              book: groupValue.book.baseEntity,
              chapter: groupValue.chapter.baseEntity,
              fromIndex: verse.number,
              content: sections[0].content.map((el) => {
                return {
                  ...el,
                  text: [el.text],
                };
              }),
            })
          );
        }

    })
  }

  protected readonly ListBoxTemplates = ListBoxTemplates;
  protected readonly BibleBookType = BibleBookType;
}
