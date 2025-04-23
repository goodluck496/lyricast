import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
  BibleBookTitle,
  BibleBookType,
  BibleChapterSection,
  BibleChapterShort,
  BibleTranslateShort,
  BibleVerse,
} from '@lyri-cast/entities';
import {
  combineLatest,
  debounceTime,
  delay,
  filter,
  fromEvent,
  map,
  Observable,
  take,
  tap,
  withLatestFrom,
} from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';
import { Store } from '@ngrx/store';

import {
  BibleActions,
  BibleState,
  selectBooks,
  selectChapterLoading,
  selectSelectedBibleVerse,
  selectSelectedBook,
  selectSelectedChapterSections,
  selectSelectedPath,
} from '@lyri-cast/bible-store';
import { BibleChapterComponent } from '../../components/bible-chapter/bible-chapter.component';
import {
  IUiLyriItemInList,
  IUiLyriListItem,
  ListBoxComponent,
  ListBoxTemplates,
} from '@lyri-cast/form';
import {
  PAGE_CONTAINER_TEMPLATES,
  Pages,
  SidebarService,
} from '@lyri-cast/common-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { BibleApiService } from '@lyri-cast/data-access-bible';
import { Router } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { BibleSidebarComponent } from '../../components/bible-sidebar/bible-sidebar.component';
import { BibleSidebarData } from '../../types';

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
    BibleChapterComponent,
    OverlayPanelModule,
    BibleSidebarComponent,
  ],
  templateUrl: './bible-page.component.html',
  styleUrl: './bible-page.component.scss',
})
export class BiblePageComponent implements OnInit, AfterViewInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly elRef = inject(ElementRef);
  private readonly apiSrv = inject(BibleApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject<Store<BibleState>>(Store<BibleState>);
  private readonly actions$ = inject(Actions);
  private readonly sidebarService =
    inject<SidebarService<BibleSidebarData>>(SidebarService);

  bibleFormGroup = new FormGroup({
    translate: new FormControl<IUiLyriListItem<BibleTranslateShort> | null>(
      null
    ),
    book: new FormControl<IUiLyriListItem<BibleBookShort> | null>(null),
    chapter: new FormControl<IUiLyriListItem<BibleChapterShort> | null>(null),
    content: new FormControl(null),
  });

  lyriBibleChapter = viewChild(BibleChapterComponent);

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
      ),
      tap(() => {
        this.isLoading.set(false);
      })
    );
  bibleTranslates: IUiLyriListItem<BibleTranslateShort>[] = [];

  bookList$: Observable<IUiLyriItemInList<BibleBookShort>[]> = this.store
    .select(selectBooks)
    .pipe(
      filterEmpty(),
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

  isLoading = signal(true);

  firstLoad = false;

  setBooks$ = this.actions$
    .pipe(
      ofType(BibleActions.setBooks),
      delay(1000),
      map((payload) => {
        const firstBook = payload.data[0];
        if (firstBook && !this.firstLoad) {
          this.firstLoad = true;
          this.bibleFormGroup.controls.book.setValue({
            searchKey: firstBook.number.toString(),
            title: firstBook.title.full,
            baseEntity: firstBook,
          });
        }
      })
    )
    .subscribe();

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

    this.bibleFormGroup.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef), filterEmpty())
      .subscribe((value) => {

        this.sidebarService.updateData({
          bibleForm: {
            book: value?.book || null,
            chapter: value?.chapter || null,
            translate: value?.translate || null,
            content: value?.content || [],
          },
        });
      });
  }

  isActivePage() {
    return this.router.isActive(
      [Pages.MAIN, Pages.BIBLE_FEATURE, Pages.BIBLE].join('/'),
      {
        paths: 'exact',
        queryParams: 'exact',
        fragment: 'ignored',
        matrixParams: 'ignored',
      }
    );
  }

  ngOnInit(): void {
    combineLatest([
      fromEvent<KeyboardEvent>(this.elRef.nativeElement, 'keydown').pipe(
        takeUntilDestroyed(this.destroyRef),
        debounceTime(100)
      ),
    ])
      .pipe(
        withLatestFrom(
          this.store.select(selectChapterLoading),
          this.store.select(selectSelectedBibleVerse)
        ),
        map((data) => data.flat() as [KeyboardEvent, boolean, BibleVerse]),
        filter(([, loading, verse]) => !loading || !verse)
      )
      .subscribe(([event, , verse]) => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          this.onNavigateSlide(
            event.key === 'ArrowDown' ? 'next' : 'prev',
            verse
          );
        }

        if (event.key === 'Enter') {
          this.onStartCasting();
        }

        if (event.key === 'Escape') {
          this.onPauseCasting();
        }
      });
  }

  ngAfterViewInit() {
    this.bibleTranslates$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.bibleTranslates = [...data];
        const translate = data.find((el) =>
          el.searchKey.toLowerCase().includes('rst')
        );
        if (!translate) {
          return;
        }
        this.bibleFormGroup.patchValue({
          translate,
          book: null,
        });
      });
  }

  //////////////////////
  ////////перенести в эффекты
  //////////////////////
  onStartCasting() {
    this.store
      .select(selectSelectedBibleVerse)
      .pipe(take(1), filterEmpty(), withLatestFrom(this.sectionList$))
      .subscribe(([verse, sections]) => {
        const groupValue = this.bibleFormGroup.value;

        if (groupValue.book && groupValue.chapter && sections.length) {
          this.store.dispatch(
            BibleActions.openCasting({
              book: groupValue.book.baseEntity,
              chapter: groupValue.chapter.baseEntity,
              fromIndex: verse.number,
              content: sections[0].content.map((el) => {
                return {
                  ...el,
                  text: [el.text],
                  bookTitle: groupValue?.book?.baseEntity
                    ?.title as BibleBookTitle,
                };
              }),
            })
          );

          this.onFocusChapter();
        }
      });
  }

  onFocusChapter() {
    setTimeout(() => {
      this.lyriBibleChapter()?.elRef.nativeElement.focus();
    }, 100);
  }

  onPauseCasting() {
    this.store.dispatch(BibleActions.pauseCasting());
    this.onFocusChapter();
  }

  onNavigateSlide(dir: 'prev' | 'next', selectedVerse: BibleVerse) {
    if (dir === 'prev') {
      if (selectedVerse.prev.chapterChanged || selectedVerse.prev.bookChanged) {
        this.store.dispatch(
          BibleActions.changePath({ path: selectedVerse.prev.path })
        );
        //////////////////////
        ////////перенести в эффекты
        this.onStartCasting();
        //////////////////////
      } else {
        this.store.dispatch(
          BibleActions.selectPrevOrNextVerse(selectedVerse.prev)
        );
      }
    } else if (dir === 'next') {
      if (selectedVerse.next.chapterChanged || selectedVerse.next.bookChanged) {
        this.store.dispatch(
          BibleActions.changePath({ path: selectedVerse.next.path })
        );

        //////////////////////
        ////////перенести в эффекты
        this.onStartCasting();
        //////////////////////
      } else {
        this.store.dispatch(
          BibleActions.selectPrevOrNextVerse(selectedVerse.next)
        );
      }
    }
  }

  protected readonly ListBoxTemplates = ListBoxTemplates;
  protected readonly BibleBookType = BibleBookType;
  protected readonly Pages = Pages;
  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
}
