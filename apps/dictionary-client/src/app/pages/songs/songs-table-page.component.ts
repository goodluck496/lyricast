import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ISong, SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';
import { SkeletonModule } from 'primeng/skeleton';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs';
import { DialogModule } from 'primeng/dialog';

import { SongEditorSidebarComponent } from './components/song-editor-sidebar/song-editor-sidebar.component';
import { MetaDialogComponent } from './components/meta-dialog/meta-dialog.component';

@Component({
  standalone: true,
  selector: 'lyri-songs-table-page',
  imports: [
    TableModule,
    ButtonModule,
    BadgeModule,
    TooltipModule,
    SkeletonModule,
    CommonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    FormsModule,
    DialogModule,
    SongEditorSidebarComponent,
    MetaDialogComponent,
  ],
  templateUrl: './songs-table-page.component.html',
  styleUrl: './songs-table-page.component.scss',
})
export class SongsTablePageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(SongsDictionaryApiService);
  private destroy$ = new Subject<void>();

  dbId!: string;
  songs: ISong[] = [];

  currentDb: SongDatabaseInfoDto | null = null;

  totalRecords = 0;
  rows = 50;
  nextSongNumber: number | null = null;

  drawerVisible = false;
  selectedSongId: string | null = null;

  searchQuery = '';
  isSearching = false;
  private searchSubject$ = new Subject<string>();

  metaDialogVisible = false;

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
    this.setupSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch(): void {
    this.searchSubject$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          this.isSearching = true;

          if (!query.trim()) {
            // If query is empty, load all songs
            return this.api.searchSongs({
              db: this.dbId,
              page: 1,
              pageSize: this.rows,
              includeLyrics: false,
            });
          }

          // Search with query
          return this.api.searchSongs({
            db: this.dbId,
            page: 1,
            pageSize: this.rows,
            query: query,
            includeLyrics: false,
          });
        })
      )
      .subscribe({
        next: (res) => {
          this.songs = res.items;
          this.totalRecords = res.totalCount;
          this.rows = res.pageSize;
          this.nextSongNumber = this.computeNextSongNumber(res.items);
          this.isSearching = false;
        },
        error: () => {
          this.isSearching = false;
        },
      });
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    this.searchSubject$.next(query);
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
      const safeName = (this.currentDb?.db || this.dbId)
        .replace(/\s+/g, '_')
        .replace('.sqlite', '');
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

  loadSongs(page: number, pageSize: number, query?: string): void {
    this.isSearching = !!query;

    // Use the searchSongs API which already handles both regular search and text search
    this.api
      .searchSongs({
        db: this.dbId,
        page,
        pageSize,
        query: query || undefined,
        includeLyrics: false,
      })
      .subscribe({
        next: (res) => {
          this.songs = res.items;
          this.totalRecords = res.totalCount;
          this.rows = res.pageSize;
          this.isSearching = false;
        },
        error: () => {
          this.isSearching = false;
        },
      });
  }

  createSong(): void {
    this.drawerVisible = true;
    this.nextSongNumber = this.computeNextSongNumber(this.songs);
    this.selectedSongId = null;
  }

  editSong(song: ISong): void {
    this.drawerVisible = true;
    this.nextSongNumber = null;
    this.selectedSongId = String(song.id ?? song.number);
  }

  onPageChange(event: TablePageEvent): void {
    console.log(event);
    const pageIndex = Math.floor(
      (event.first ?? 0) / (event.rows ?? this.rows)
    );
    const page = pageIndex + 1; // PrimeNG pages are 0-based, API использует 1-based

    if (this.searchQuery.trim()) {
      // If there's a search query, update search with new page
      this.isSearching = true;
      this.api
        .searchSongs({
          db: this.dbId,
          page,
          pageSize: event.rows ?? this.rows,
          query: this.searchQuery,
          includeLyrics: false,
        })
        .subscribe({
          next: (res) => {
            this.songs = res.items;
            this.totalRecords = res.totalCount;
            this.rows = res.pageSize;
            this.isSearching = false;
          },
          error: () => {
            this.isSearching = false;
          },
        });
    } else {
      // Regular pagination without search
      this.loadSongs(page, event.rows ?? this.rows);
    }
  }

  onSidebarSaved(): void {
    if (this.searchQuery.trim()) {
      // Refresh search results after saving
      this.searchSubject$.next(this.searchQuery);
    } else {
      // Refresh all songs
      this.loadSongs(1, this.rows);
    }
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

  private computeNextSongNumber(songs: ISong[] | null | undefined): number {
    const baseByMeta = (this.currentDb?.songCount ?? 0) + 1;

    if (!songs || songs.length === 0) {
      return baseByMeta || 1;
    }

    const pageMax =
      Math.max(
        ...songs
          .map((s) => s.number ?? 0)
          .filter((n) => Number.isFinite(n) && n > 0),
        0
      ) + 1;

    return Math.max(baseByMeta, pageMax, 1);
  }

  openMetaDialog(): void {
    if (!this.currentDb) return;
    this.metaDialogVisible = true;
  }

  closeMetaDialog(): void {
    this.metaDialogVisible = false;
  }

  onMetaSaved(): void {
    this.metaDialogVisible = false;
    this.loadDbMeta();
  }
}
