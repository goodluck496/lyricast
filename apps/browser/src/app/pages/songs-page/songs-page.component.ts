import { Component, inject, OnInit } from '@angular/core';
import { WindowService } from '../../../services/common/window.service';
import { SongsService } from '../../songs.service';
import { CastingService } from '../../../services/casting.service';
import { ActivatedRoute } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { IShortSong, ISong, ISongBookName } from '@lyri-cast/entities';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AsyncPipe, CommonModule, JsonPipe } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { PrimeTemplate } from 'primeng/api';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { MenubarModule } from 'primeng/menubar';
import { InputTextModule } from 'primeng/inputtext';
import { LyricItemComponent } from './components/lyric-item/lyric-item.component';
import { ChooseLyricItemService } from './choose-lyric-item.service';
import { ListboxModule } from 'primeng/listbox';
import { BadgeModule } from 'primeng/badge';
import {
  MatList,
  MatListItem,
  MatListOption,
  MatSelectionList,
} from '@angular/material/list';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { InputNumberModule } from 'primeng/inputnumber';
import { FloatLabelModule } from 'primeng/floatlabel';
import { filterEmpty } from '@lyri-cast/common';
import { OverlayPanelModule } from 'primeng/overlaypanel';

@Component({
  selector: 'lyri-songs-page',
  standalone: true,
  imports: [
    CommonModule,
    AsyncPipe,
    ButtonDirective,
    CardModule,
    JsonPipe,
    PrimeTemplate,
    ScrollPanelModule,
    MenubarModule,
    InputTextModule,
    ReactiveFormsModule,
    LyricItemComponent,
    ListboxModule,
    BadgeModule,
    MatSelectionList,
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    MatListOption,
    CdkVirtualForOf,
    MatList,
    MatListItem,
    InputNumberModule,
    FormsModule,
    FloatLabelModule,
    OverlayPanelModule,
  ],
  templateUrl: './songs-page.component.html',
  styleUrl: './songs-page.component.scss',
  providers: [ChooseLyricItemService],
})
export class SongsPageComponent implements OnInit {
  public windowSrv = inject(WindowService);
  public songsService = inject(SongsService);
  public castingSrv = inject(CastingService);
  private route = inject(ActivatedRoute);
  public chooseLyricItemService = inject(ChooseLyricItemService);

  songBooksControl = new FormControl<ISongBookName[]>([]);
  songsControl = new FormControl<IShortSong[]>([]);

  songBooks$ = this.songsService.getAllSongBooks();

  selectedBook$ = new BehaviorSubject<ISongBookName | null>(null);

  selectedSong$ = new BehaviorSubject<IShortSong | null>(null);

  selectedFullSong$ = this.selectedSong$.pipe(
    switchMap((item) => {
      if (!item) {
        return of(null);
      }

      return this.songsService.getSong(this.selectedBook$.value!, item.number);
    })
  );

  searchSongControl = new FormControl<string>('');

  songs$: Observable<ISong[]> = combineLatest([
    this.searchSongControl.valueChanges.pipe(startWith('')),
    this.selectedBook$,
  ]).pipe(
    debounceTime(500),
    switchMap(([search, book]) => {
      if (!book) {
        return of([]);
      }

      return this.songsService.findSongsByBook(book, search || '');
    })
  );

  selectedLyricBlock$ = combineLatest([
    this.chooseLyricItemService.getSelectedLyric(),
    this.chooseLyricItemService.splitRowCount$,
  ]).pipe(
    debounceTime(0),
    map(([[lyric, selectedBlockIndex], splitCount]) => {
      const chunks = this.chooseLyricItemService.splitIntoChunks(
        lyric?.lines || [],
        splitCount
      );

      return {
        lyric: lyric,
        selectedChunk: chunks[selectedBlockIndex || 0],
      };
    }),
    tap((data) => {
      this.selectedFullSong$.pipe(take(1), filterEmpty()).subscribe((song) => {
        if (!data.lyric) {
          return;
        }
        this.castingSrv.showLyricBlock(song, {
          lyric: data.lyric,
          selectedChunk: data.selectedChunk,
        });
      });
    })
  );

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      console.log('params', params);
    });
    this.chooseLyricItemService
      .getSelectedLyric()
      .pipe()
      .subscribe((v) => {
        console.log('getSelectedLyric', v);
      });
    this.songsControl.valueChanges.subscribe((v) =>
      console.log('change song', v)
    );
  }

  onBookClick(item: ISongBookName) {
    this.selectedBook$.next(item);
    this.selectedSong$.next(null);
  }

  onSongClick(song: IShortSong): void {
    this.selectedSong$.next(song);
    this.chooseLyricItemService.reset();
    this.castingSrv.hideCasting();
  }

  onOpenWindow() {
    combineLatest([
      this.selectedFullSong$.pipe(filterEmpty()),
      this.selectedLyricBlock$.pipe(filterEmpty()),
    ])
      .pipe(
        debounceTime(0),
        take(1),
        switchMap(([song, lyricBlock]) => {
          if (!lyricBlock.lyric) {
            return of(null);
          }

          return this.castingSrv.openWindow({
            song,
            lyricBlock: {
              lyric: lyricBlock.lyric,
              selectedChunk: lyricBlock.selectedChunk,
            },
          });
        })
      )
      .subscribe();
  }

  onHideCasting(): void {
    this.castingSrv.hideCasting();
  }

  onCloseCasting(): void {
    this.castingSrv.closeCasting();
  }

  // this.selectedLyricBlock$

  onChangeSplitValue(value: any) {
    this.chooseLyricItemService.splitRowCount$.next(value || 1);
    console.log('onChangeSplitValue', value);
  }

  onEdit(): void {}
}
