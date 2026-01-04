import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { ISong, SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';
import { SkeletonModule } from 'primeng/skeleton';

import { SongEditorSidebarComponent } from './components/song-editor-sidebar/song-editor-sidebar.component';

@Component({
  standalone: true,
  selector: 'lyri-songs-table-page',
  imports: [
    TableModule,
    ButtonModule,
    BadgeModule,
    TooltipModule,
    SkeletonModule,
    SongEditorSidebarComponent,
  ],
  templateUrl: './songs-table-page.component.html',
  styleUrl: './songs-table-page.component.scss',
})
export class SongsTablePageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(SongsDictionaryApiService);

  dbId!: string;
  songs: ISong[] = [];

  currentDb: SongDatabaseInfoDto | null = null;

  totalRecords = 0;
  rows = 50;

  drawerVisible = false;
  selectedSongId: string | null = null;

  isEditingRow(song: ISong): boolean {
    if (!this.selectedSongId) {
      return false;
    }

    return String(song.id ?? song.number) === this.selectedSongId;
  }

  ngOnInit(): void {
    this.dbId = this.route.snapshot.paramMap.get('dbId')!;
    this.loadDbMeta();
    this.loadSongs(1, this.rows);
  }

  private loadDbMeta(): void {
    this.api.getSongDatabases().subscribe((dbs) => {
      this.currentDb = dbs.find((d) => d.db === this.dbId) ?? null;
    });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadSqlite(): void {
    this.api.downloadDb(this.dbId).subscribe((blob) => {
      const safeName = (
        this.currentDb?.title ||
        this.currentDb?.db ||
        this.dbId
      ).replace(/\s+/g, '_');
      this.saveBlob(blob, `${safeName}.sqlite`);
    });
  }

  downloadJson(): void {
    this.api.exportBook(this.dbId).subscribe((res) => {
      const content = JSON.stringify(res, null, 2);
      const blob = new Blob([content], {
        type: 'application/json;charset=utf-8',
      });
      this.saveBlob(blob, `${res.header.bookKey}.songs.json`);
    });
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
    this.drawerVisible = true;
    this.selectedSongId = null;
  }

  editSong(song: ISong): void {
    this.drawerVisible = true;
    this.selectedSongId = String(song.id ?? song.number);
  }

  onPageChange(event: TablePageEvent): void {
    console.log(event);
    const pageIndex = Math.floor(
      (event.first ?? 0) / (event.rows ?? this.rows)
    );
    const page = pageIndex + 1; // PrimeNG pages are 0-based, API использует 1-based
    this.loadSongs(page, event.rows ?? this.rows);
  }

  onSidebarSaved(): void {
    this.loadSongs(1, this.rows);
    this.loadDbMeta(); // Обновляем метаданные для получения новой версии и счетчика
  }

  onSidebarClosed(): void {
    this.drawerVisible = false;
    this.selectedSongId = null;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString(
      'ru-RU',
      { hour: '2-digit', minute: '2-digit' }
    )}`;
  }
}
