import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';

@Component({
  standalone: true,
  selector: 'lyri-songs-dbs-page',
  imports: [CommonModule, CardModule],
  styleUrl: './songs-dbs-page.component.scss',
  templateUrl: './songs-dbs-page.component.html',
})
export class SongsDbsPageComponent implements OnInit {
  private api = inject(SongsDictionaryApiService);
  private router = inject(Router);

  dbs: SongDatabaseInfoDto[] = [];

  ngOnInit(): void {
    this.api.getSongDatabases().subscribe((dbs) => {
      this.dbs = dbs;
    });
  }

  openDb(db: SongDatabaseInfoDto): void {
    this.router.navigate(['/songs', db.db]);
  }
}
