import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { AuthOverlayService } from '../../../../auth/auth-overlay.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  standalone: true,
  selector: 'lyri-songs-cards-page',
  imports: [CommonModule, SongDictionaryCardComponent],
  styleUrl: './song-cards-page.component.scss',
  templateUrl: './song-cards-page.component.html',
})
export class SongCardsPageComponent implements OnInit {
  private api = inject(SongsDictionaryApiService);
  private router = inject(Router);
  private authOverlay = inject(AuthOverlayService);

  dbs: SongDatabaseInfoDto[] = [];

  ngOnInit(): void {
    this.api.getSongDatabases().subscribe({
      next: (dbs) => {
        this.dbs = dbs;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.authOverlay.openAndWaitForToken().subscribe(() => {
            this.ngOnInit(); // Retry after auth
          });
        }
      }
    });
  }

  openDb(db: SongDatabaseInfoDto): void {
    this.router.navigate(['/songs', db.db]);
  }

  // UI rendering is delegated to SongDictionaryCardComponent
}
