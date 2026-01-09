import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CardModule } from 'primeng/card';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';

@Component({
  standalone: true,
  selector: 'lyri-song-dictionary-card',
  imports: [CommonModule, CardModule, BadgeModule, TooltipModule],
  templateUrl: './song-dictionary-card.component.html',
  styleUrl: './song-dictionary-card.component.scss',
})
export class SongDictionaryCardComponent {
  @Input({ required: true }) db!: SongDatabaseInfoDto;
  @Input() clickable = false;
  @Input() size: 'sm' | 'md' = 'md';

  @Output() cardClick = new EventEmitter<void>();

  onClick(): void {
    if (!this.clickable) return;
    this.cardClick.emit();
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
