import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { ImportBookDialogComponent } from '../import-book-dialog/import-book-dialog.component';
import { AuthOverlayService } from '../../../../auth/auth-overlay.service';
import { SkeletonModule } from 'primeng/skeleton';
import { take } from 'rxjs';

@Component({
  standalone: true,
  selector: 'lyri-songs-cards-page',
  imports: [
    CommonModule,
    SongDictionaryCardComponent,
    DialogModule,
    ImportBookDialogComponent,
    SkeletonModule,
  ],
  styleUrl: './song-cards-page.component.scss',
  templateUrl: './song-cards-page.component.html',
})
export class SongCardsPageComponent implements OnInit {
  private api = inject(SongsDictionaryApiService);
  private router = inject(Router);
  private authOverlay = inject(AuthOverlayService);

  dbs: SongDatabaseInfoDto[] = [];
  importDialogVisible = false;
  isLoading = true;
  readonly skeletonPlaceholders = Array.from({ length: 4 }, (_, index) => index);
  readonly defaultCatalogId = 1;

  ngOnInit(): void {
    this.loadDatabases();
  }

  openDb(db: SongDatabaseInfoDto): void {
    this.router.navigate(['/songs', db.db]);
  }

  openImportDialog(): void {
    this.importDialogVisible = true;
  }

  closeImportDialog(): void {
    this.importDialogVisible = false;
  }

  handleImportCompleted(): void {
    this.importDialogVisible = false;
    this.loadDatabases();
  }

  private loadDatabases(): void {
    this.isLoading = true;
    this.api.getSongDatabases().subscribe({
      next: (dbs) => {
        this.dbs = dbs;
        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.authOverlay
            .openAndWaitForToken()
            .pipe(take(1))
            .subscribe({
              next: () => this.loadDatabases(),
              error: () => (this.isLoading = false),
              complete: () => (this.isLoading = false),
            });
          return;
        }
        this.isLoading = false;
      },
    });
  }
}
