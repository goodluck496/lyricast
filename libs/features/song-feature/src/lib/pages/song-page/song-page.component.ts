import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { PrimeTemplate } from 'primeng/api';

import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  fromEvent,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { HighlighterPipe, PageContainerComponent } from '@lyri-cast/ui-lib';
import { AsyncPipe } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  IShortSong,
  ISong,
  ISongBookName,
  Lyric,
  LyricForCasting,
  LyricLine,
  LyricTypeEnum,
} from '@lyri-cast/entities';
import { filterEmpty, snapshot } from '@lyri-cast/common';
import { DropdownModule } from 'primeng/dropdown';
import { ListboxModule } from 'primeng/listbox';
import { ButtonDirective } from 'primeng/button';
import { CastingService } from '../../services/casting.service';
import { InputTextModule } from 'primeng/inputtext';
import {
  SongPageSelectService,
  SPLIT_PARTS_COUNT,
  SplitPartsCount,
} from './song-page-select.service';
import { Store } from '@ngrx/store';
import { SongActions } from '../../../index';
import { SongsApiService } from '../../services/songs-api.service';
import { CastingPreviewComponent, SongComponent } from '../../components/index';
import {
  IUiLyriItemInList,
  IUiLyriListItem,
  ListBoxComponent,
  ListBoxTemplates,
} from '@lyri-cast/form';
import { CheckboxModule } from 'primeng/checkbox';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { selectCastingPaused } from '../../store/song.selectors';
import { selectOpenedWindow } from '@lyri-cast/common-browser';

export const SplitPartsCountMapVm: Record<SplitPartsCount, string> = {
  [SPLIT_PARTS_COUNT.NONE]: 'Нет',
  [SPLIT_PARTS_COUNT.TWO]: '2',
  [SPLIT_PARTS_COUNT.THREE]: '3',
  [SPLIT_PARTS_COUNT.FOUR]: '4',
};

@Component({
  selector: 'lyri-song-page-new',
  standalone: true,
  imports: [
    PrimeTemplate,
    AsyncPipe,
    ReactiveFormsModule,
    DropdownModule,
    ListboxModule,
    ListBoxComponent,
    SongComponent,
    ButtonDirective,
    HighlighterPipe,
    InputTextModule,
    FormsModule,
    CastingPreviewComponent,
    PageContainerComponent,
    CheckboxModule,
  ],
  templateUrl: './song-page.component.html',
  styleUrl: './song-page.component.scss',
  providers: [SongPageSelectService],
})
export class SongPageComponent implements OnInit, AfterViewInit {
  private songPageSelectSrv = inject(SongPageSelectService);
  private readonly songsApiService = inject(SongsApiService);
  private readonly castingSrv = inject(CastingService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(Store);

  searchSig = signal<string>('');
  splitCount = signal<SplitPartsCount>(SPLIT_PARTS_COUNT.NONE);
  chorusAfterCouplet = signal(true);

  songBooksDict: IUiLyriListItem<ISongBookName>[] = [];

  songBooks$ = this.songsApiService.getAllSongBooks();

  songBooksDict$: Observable<IUiLyriListItem<ISongBookName>[]> =
    this.songBooks$.pipe(
      map((data) =>
        data.map((el) => {
          return {
            title: el.humanName,
            searchKey: el.fileKey,
            baseEntity: el,
          };
        })
      )
    );

  selectedBook = new FormControl<IUiLyriListItem<ISongBookName> | null>(null);
  songControl = new FormControl<IUiLyriListItem<IShortSong> | null>(null);

  songsList$: Observable<IUiLyriItemInList<IShortSong>[]> =
    this.selectedBook.valueChanges.pipe(
      filterEmpty(),
      switchMap((value) => {
        return this.songsApiService.getAllSongsByBook(value.baseEntity);
      }),
      map((data) => {
        return data.map((el) => {
          return {
            title: el.title,
            searchKey: String(el.number),
            baseEntity: el,
          };
        });
      }),
      tap(() => {
        this.songControl.setValue(null);
      })
    );

  selectedSong$ = new BehaviorSubject<ISong | null>(null);
  _selectedSong$: Observable<ISong | null> = this.songControl.valueChanges.pipe(
    switchMap((data) => {
      const selectedBook = this.selectedBook.value;
      if (!selectedBook) {
        throw new Error('Не выбран справочник');
      }

      if (!data) {
        this.songPageSelectSrv.selectSong(null);
        return of(null);
      }
      return this.songsApiService.getSong(
        selectedBook.baseEntity,
        data.baseEntity.number
      );
    }),
    // filterEmpty(), //почему-то даже в случае возвращения switchMapом null,
    // в data лежит предыдущий объект, можно пофиксить в рамках рефакторинга
  );

  changeChorusAfterCouplet$ = toObservable(this.chorusAfterCouplet);

  castingIsPaused$ = this.store.select(selectCastingPaused);
  openedCastingWindow$ = this.store.select(selectOpenedWindow).pipe(map(e => !!e))

  ngOnInit() {
    fromEvent<KeyboardEvent>(this.elRef.nativeElement, 'keydown')
      .pipe(debounceTime(100))
      .subscribe((event: KeyboardEvent) => {
        const selectedLyric = this.songPageSelectSrv.selectedLyric();
        if (selectedLyric) {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            this.onNavigateSlide(event.key === 'ArrowDown' ? 'next' : 'prev');
          }

          if (event.key === 'Enter') {
            this.onStartCasting(true);
          }
        }
      });

    combineLatest([
      this._selectedSong$.pipe(filterEmpty()),
      this.changeChorusAfterCouplet$.pipe(startWith(true)),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([song, changeChorusAfterCouplet]) => {
        const newSong = this.updateSong(song);

        ///////// todo сделать отдельной функцией
        this.songPageSelectSrv.selectSong(newSong);
        this.store.dispatch(SongActions.selectSong(newSong));
        this.store.dispatch(SongActions.pauseCasting());
        const splitCount =
          newSong.lyrics[0]?.splitLinesCount || SPLIT_PARTS_COUNT.NONE;
        this.splitCount.set(splitCount);
        this.songPageSelectSrv.setSplitCountValue(splitCount);
        /////////////////////////
        this.selectedSong$.next(newSong);

        this.cdr.detectChanges();
      });
  }

  ngAfterViewInit() {
    this.songBooksDict$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.songBooksDict = [...data];
        const book = data.find((el) => el.searchKey.includes('pesn'));
        if (!book) {
          return;
        }
        this.selectedBook.setValue(book);
      });
  }

  updateSong(song: ISong): ISong {
    const cloneSong: ISong = JSON.parse(JSON.stringify(song));

    if (!this.chorusAfterCouplet()) {
      return {
        ...cloneSong,
        lyrics: clearChorus(cloneSong.lyrics),
      };
    }

    // удаляет дублирующиеся куплеты
    function clearChorus(lyrics: Lyric[]) {
      const newLyric: Lyric[] = [];

      lyrics.forEach((lyric) => {
        const foundChorus = newLyric.find(
          (el) => el.type === LyricTypeEnum.CHORUS
        );
        if (foundChorus && lyric.type === LyricTypeEnum.CHORUS) {
          return;
        }
        newLyric.push(lyric);
      });

      return newLyric;
    }

    // добавляет куплеты после припевов
    function insertChorus(lyrics: Lyric[]) {
      const result: Lyric[] = [];
      const chorus = lyrics.find((item) => item.type === LyricTypeEnum.CHORUS);
      if (!chorus) return lyrics;

      for (let i = 0; i < lyrics.length; i++) {
        const lyric = lyrics[i];
        const nextLyricIsChorus = lyrics[i + 1]?.type === LyricTypeEnum.CHORUS;

        result.push(lyric);

        if (lyric.type === LyricTypeEnum.COUPLET && !nextLyricIsChorus) {
          result.push({
            ...chorus,
            uniqId: lyric.uniqId + (Math.random() * 1000).toFixed(0),
          });
        }
      }

      return result;
    }

    cloneSong.lyrics = insertChorus(song.lyrics);

    return cloneSong;
  }

  public onSearch(value: string) {
    console.log('search', value);
  }

  onStartCasting(fromSelectedBlock = false): void {
    const payload =
      this.songPageSelectSrv.getStartCastingPayload(fromSelectedBlock);
    if (!payload) {
      return;
    }

    this.castingSrv.openCastingPageHandler(payload);
  }

  onPauseCasting(): void {
    this.castingSrv.pauseCasting();
  }

  onCloseCasting(): void {
    this.castingSrv.closeCasting();
  }

  onSelectLyricLine([lyric, line, startPresentation]: [
    LyricForCasting,
    LyricLine,
    boolean
  ]): void {
    this.songPageSelectSrv.showPreview(true, lyric, line);

    const paused = snapshot(this.castingSrv.castingPaused$);

    if (startPresentation || !paused) {
      this.onStartCasting(true);
    }
  }

  onSelectSplitValue(value: SplitPartsCount) {
    this.songPageSelectSrv.setSplitCountValue(value);
  }

  onNavigateSlide(dir: 'prev' | 'next') {
    const navigatePayload = this.songPageSelectSrv.getNavigatePayload(dir);
    if (!navigatePayload) {
      console.log('Cancel navigate payload', dir);
      return;
    }
    this.castingSrv.navigateSlide(navigatePayload);
  }

  protected readonly ListBoxTemplates = ListBoxTemplates;
  protected readonly SplitPartsCountOptions = (
    Object.keys(SPLIT_PARTS_COUNT) as Array<keyof typeof SPLIT_PARTS_COUNT>
  ).map((key) => {
    const value = SPLIT_PARTS_COUNT[key];
    const label =
      value === SPLIT_PARTS_COUNT.NONE
        ? 'Не делить'
        : SplitPartsCountMapVm[value];
    return { label, value };
  });
}
