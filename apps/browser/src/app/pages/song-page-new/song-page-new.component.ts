import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { SongsApiService } from '../../../services/songs-api.service';
import {
  debounceTime,
  fromEvent,
  map,
  Observable,
  switchMap,
  take,
  tap,
} from 'rxjs';
import {
  HighlighterPipe,
  IUiLyriItemInList,
  IUiLyriListItem,
  ListBoxComponent,
  ListBoxTemplates,
} from '@lyri-cast/ui-lib';
import { AsyncPipe } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  IShortSong,
  ISongBookName,
  LyricForCasting,
  LyricLine,
} from '@lyri-cast/entities';
import { filterEmpty } from '@lyri-cast/common';
import { DropdownModule } from 'primeng/dropdown';
import { ListboxModule } from 'primeng/listbox';
import { SongComponent } from './components/song/song.component';
import { ButtonDirective } from 'primeng/button';
import { CastingService } from '../../../services/casting.service';
import { InputTextModule } from 'primeng/inputtext';
import {
  SongPageSelectService,
  SPLIT_PARTS_COUNT,
  SplitPartsCount,
} from './song-page-select.service';
import { CastingPreviewComponent } from './components/casting-preview/casting-preview.component';

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
  ],
  templateUrl: './song-page-new.component.html',
  styleUrl: './song-page-new.component.scss',
  providers: [SongPageSelectService],
})
export class SongPageNewComponent implements OnInit, AfterViewInit {
  public songPageSelectSrv = inject(SongPageSelectService);
  public songsService = inject(SongsApiService);
  public castingSrv = inject(CastingService);
  cdr = inject(ChangeDetectorRef);
  elRef = inject(ElementRef);

  searchSig = signal<string>('');
  splitCount = signal<SplitPartsCount>(SPLIT_PARTS_COUNT.NONE);

  songBooksDict: IUiLyriListItem<ISongBookName>[] = [];

  songBooks$ = this.songsService.getAllSongBooks();

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
      tap((v) => console.log('vvv', v)),
      filterEmpty(),
      switchMap((value) => {
        return this.songsService.getAllSongsByBook(value.baseEntity);
      }),
      map((data) => {
        return data.map((el) => {
          return {
            title: el.title,
            searchKey: String(el.number),
            baseEntity: el,
          };
        });
      })
    );

  selectedSong$ = this.songControl.valueChanges.pipe(
    filterEmpty(),
    switchMap((data) => {
      const selectedBook = this.selectedBook.value;
      if (!selectedBook) {
        throw new Error('Не выбран справочник');
      }
      return this.songsService.getSong(
        selectedBook.baseEntity,
        data.baseEntity.number
      );
    }),
    tap((data) => {
      this.songPageSelectSrv.selectSong(data);
      const splitCount =
        data.lyrics[0]?.splitLinesCount || SPLIT_PARTS_COUNT.NONE;
      this.splitCount.set(splitCount);
      this.songPageSelectSrv.setSplitCountValue(splitCount);
    })
  );

  ngOnInit() {
    this.songControl.valueChanges.subscribe((v) => {
      console.log('value change', v);
    });

    fromEvent<KeyboardEvent>(this.elRef.nativeElement, 'keydown')
      .pipe(debounceTime(100))
      .subscribe((event: KeyboardEvent) => {
        const selectedLyric = this.songPageSelectSrv.selectedLyric();
        if (selectedLyric) {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            this.onNavigateSlide(event.key === 'ArrowDown' ? 'next' : 'prev');
          }

          if (event.key === 'Enter') {
            this.onStartTranslate(true);
          }
        }
      });
  }

  ngAfterViewInit() {
    this.songBooksDict$.pipe().subscribe((data) => {
      this.songBooksDict = [...data];
      const book = data.find((el) => el.searchKey.includes('pesn'));
      if (!book) {
        return;
      }
      this.selectedBook.setValue(book);
    });
  }

  public onSearch(value: string) {
    console.log('search', value);
  }

  onStartTranslate(fromSelectedBlock = false): void {
    const song = this.songPageSelectSrv.selectedSong();
    if (!song) {
      return;
    }

    const lyrics = song.lyrics.map((lyric, index) => {
      return {
        ...lyric,
        lines: this.songPageSelectSrv.splitArrayIntoParts(lyric.lines, index),
      };
    });

    this.castingSrv
      .openWindowNew()
      .pipe(
        take(1),
        tap(() => {
          const fromIndex = fromSelectedBlock
            ? this.songPageSelectSrv.selectedLyricLine()?.globalSongIndex
            : undefined;
          const selectedLyric = this.songPageSelectSrv.selectedLyric();
          this.castingSrv.showLyricBlockNew({
            song,
            lyrics,
            fromIndex,
            currentLyric: selectedLyric ? selectedLyric : lyrics[0],
          });
        })
      )
      .subscribe();
  }

  onStopTranslate(): void {
    this.castingSrv.hideCastingNew();
  }

  onSelectLyricLine([lyric, line, startPresentation]: [
    LyricForCasting,
    LyricLine,
    boolean
  ]): void {
    this.songPageSelectSrv.showPreview(true, lyric, line);

    if (startPresentation) {
      this.onStartTranslate(true);
    }
  }

  onSelectSplitValue(value: SplitPartsCount) {
    this.songPageSelectSrv.setSplitCountValue(value);
  }

  onNavigateSlide(dir: 'prev' | 'next') {
    const lyric = this.songPageSelectSrv.selectedLyric;
    const song = this.songPageSelectSrv.selectedSong();
    if (!lyric || !song) {
      return;
    }

    const currentLyricLine = this.songPageSelectSrv.selectedLyricLine();
    if (!currentLyricLine) {
      return;
    }
    const nextGlobalIndex =
      dir === 'next'
        ? currentLyricLine.globalSongIndex + 1
        : currentLyricLine.globalSongIndex - 1;
    const lyrics = this.songPageSelectSrv.selectedLyricsForCasting();
    const lyricsLines = lyrics.map((el) => el.lines).flat();
    const nextLine = lyricsLines.find(
      (el) => el.globalSongIndex === nextGlobalIndex
    );

    if (!nextLine) {
      return;
    }
    const nextLyric = lyrics.find(
      (el) =>
        el.lines.findIndex((el1) => el1.globalSongIndex === nextGlobalIndex) >=
        0
    );
    if (!nextLyric) {
      return;
    }

    this.songPageSelectSrv.showPreview(true, nextLyric, nextLine);
    this.castingSrv.navigateSlide({ dir, currentLyric: nextLyric });
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
