import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';

@Component({
  standalone: true,
  selector: 'lyri-songs-cards-page',
  imports: [CommonModule, CardModule, BadgeModule, TooltipModule],
  styleUrl: './song-cards-page.component.scss',
  templateUrl: './song-cards-page.component.html',
})
export class SongCardsPageComponent implements OnInit {
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

  getVersionTooltip(db: SongDatabaseInfoDto): string {
    const parts: string[] = [];
    
    if (db.updatedAt) {
      const date = new Date(db.updatedAt);
      parts.push(`Обновлено: ${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
    }
    
    if (db.updatedBy) {
      parts.push(`Пользователь: ${db.updatedBy}`);
    }
    
    return parts.join('\n');
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
