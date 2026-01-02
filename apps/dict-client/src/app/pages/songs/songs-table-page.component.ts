import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { NgScrollbarModule } from 'ngx-scrollbar';

import { FormsModule } from '@angular/forms';
import { ISong, Lyric, LyricLine, LyricTypeEnum } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';
import { Textarea } from 'primeng/textarea';
import { debounceTime } from 'rxjs';
import { ProgressBar } from 'primeng/progressbar';

@Component({
  standalone: true,
  selector: 'lyri-songs-table-page',
  imports: [
    TableModule,
    ButtonModule,
    AccordionModule,
    FloatLabelModule,
    InputTextModule,
    ProgressSpinnerModule,
    NgScrollbarModule,
    FormsModule,
    Textarea,
    ProgressBar,
  ],
  templateUrl: './songs-table-page.component.html',
  styleUrl: './songs-table-page.component.scss',
})
export class SongsTablePageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(SongsDictionaryApiService);

  dbId!: string;
  songs: ISong[] = [];

  totalRecords = 0;
  rows = 50;

  drawerVisible = false;
  editingSong: ISong | null = null;
  isNew = false;
  isLoading = false;

  // значение активной панели аккордеона (uniqId куплета)
  activeLyricValue: string | null = null;

  ngOnInit(): void {
    this.dbId = this.route.snapshot.paramMap.get('dbId')!;
    this.loadSongs(1, this.rows);
  }

  loadSongs(page: number, pageSize: number): void {
    this.api
      .searchSongs({ db: this.dbId, page, pageSize, includeLyrics: false })
      .subscribe((res) => {
        this.songs = res.items;
        this.totalRecords = res.totalCount;
        this.rows = res.pageSize;
      });
  }

  createSong(): void {
    this.isNew = true;
    this.editingSong = this.api.createEmptySong();
    this.drawerVisible = true;
  }

  editSong(song: ISong): void {
    this.isNew = false;
    this.drawerVisible = true;
    this.editingSong = null;

    // здесь предполагаем, что song.number совпадает с songId на сервере
    this.api.getSong(this.dbId, String(song.number)).subscribe((fullSong) => {
      this.editingSong = fullSong;

      // по умолчанию открываем первый куплет, если он есть
      this.activeLyricValue =
        fullSong.lyrics && fullSong.lyrics.length > 0
          ? fullSong.lyrics[0].uniqId
          : null;
    });
  }

  saveSong(): void {
    if (!this.editingSong) return;
    this.isLoading = true;
    this.api
      .saveSong(this.dbId, this.editingSong)
      .pipe(debounceTime(300))
      .subscribe(() => {
        // this.drawerVisible = false;
        // this.editingSong = null;
        this.isLoading = false;
        this.loadSongs(1, this.rows);
      });
  }

  onPageChange(event: TablePageEvent): void {
    console.log(event);
    const pageIndex = Math.floor(
      (event.first ?? 0) / (event.rows ?? this.rows)
    );
    const page = pageIndex + 1; // PrimeNG pages are 0-based, API использует 1-based
    this.loadSongs(page, event.rows ?? this.rows);
  }

  addLyric(): void {
    if (!this.editingSong) return;

    if (!this.editingSong.lyrics) {
      this.editingSong.lyrics = [];
    }

    const newLyric: Lyric = {
      songId: '',
      uniqId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sectionTitle: '',
      type: LyricTypeEnum.COUPLET,
      splitLinesCount: 1,
      lines: [
        {
          id: undefined,
          rangeIndex: '0-0',
          index: 0,
          globalSongIndex: 0,
          text: '',
        },
      ],
    };

    this.editingSong.lyrics = [...this.editingSong.lyrics, newLyric];
  }

  addLine(lyric: Lyric): void {
    if (!lyric.lines) {
      lyric.lines = [];
    }
    const idx = lyric.lines.length;
    const newLine: LyricLine = {
      id: undefined,
      rangeIndex: `${idx}-${idx}`,
      index: idx,
      globalSongIndex: idx,
      text: '',
    };

    lyric.lines = [...lyric.lines, newLine];
  }

  removeLine(lyric: Lyric, index: number): void {
    if (!lyric.lines || index < 0 || index >= lyric.lines.length) {
      return;
    }

    const lines = [...lyric.lines];
    lines.splice(index, 1);
    lyric.lines = lines;
  }

  removeLyric(index: number): void {
    if (!this.editingSong || !this.editingSong.lyrics) return;

    const lyrics = [...this.editingSong.lyrics];
    lyrics.splice(index, 1);
    this.editingSong.lyrics = lyrics;
  }
}
