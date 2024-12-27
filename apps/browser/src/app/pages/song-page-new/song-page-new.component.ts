import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { SongsApiService } from '../../../services/songs-api.service';
import { map, Observable, switchMap, tap } from 'rxjs';
import {
  HighlighterPipe,
  IUiLyriItemInList,
  IUiLyriListItem,
  ListBoxComponent,
  ListBoxTemplates,
} from '@lyri-cast/ui-lib';
import { AsyncPipe } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IShortSong, ISongBookName, LyricForCasting, LyricLine } from '@lyri-cast/entities';
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
        throw new Error('Не быран справочник');
      }
      return this.songsService.getSong(
        selectedBook.baseEntity,
        data.baseEntity.number
      );
    }),
    tap((data) => {
      this.songPageSelectSrv.selectSong(data);
      const splitCount = data.lyrics[0]?.splitLinesCount || SPLIT_PARTS_COUNT.NONE;
      this.splitCount.set(splitCount);
      this.songPageSelectSrv.setSplitCountValue(splitCount)
    })
  );

  constructor() {
    effect(() => {
      // this.selectedBookRef().op
    });
  }

  ngOnInit() {
    this.songControl.valueChanges.subscribe((v) => {
      console.log('value change', v);
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

  onSelectBook(data: any): void {
    console.log('onselect', data);
    // setTimeout(() => {
    //   this.selectedBook.setValue(data, { emitEvent: true });
    // }, 1000);
  }

  onStartTranslate(): void {
    // this.selectedSong$.subscribe(song => {
    //   this.castingSrv.openWindowNew({
    //     song,
    //     lyric
    //   })
    // })
  }

  onSelectLyricLine([lyric, line]: [LyricForCasting, LyricLine]): void {
    console.log('-------lyric', lyric);

    this.songPageSelectSrv.showPreview(true, lyric, line);
  }

  onSelectSplitValue(value: SplitPartsCount) {
    this.songPageSelectSrv.setSplitCountValue(value);
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
