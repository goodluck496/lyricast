import { Component, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ConfirmationService } from 'primeng/api';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressBar } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SelectButtonModule } from 'primeng/selectbutton';
import { Textarea } from 'primeng/textarea';

import { NgScrollbarModule } from 'ngx-scrollbar';

import { Lyric } from '@lyri-cast/entities';

import { SongEditorSidebarFacade } from './song-editor-sidebar.facade';

@Component({
  standalone: true,
  selector: 'lyri-song-editor-sidebar',
  imports: [
    AccordionModule,
    ButtonModule,
    ConfirmPopup,
    DragDropModule,
    FloatLabelModule,
    FormsModule,
    InputNumberModule,
    InputTextModule,
    NgScrollbarModule,
    ProgressBar,
    ProgressSpinnerModule,
    SelectButtonModule,
    Textarea,
  ],
  providers: [ConfirmationService, SongEditorSidebarFacade],
  templateUrl: './song-editor-sidebar.component.html',
  styleUrl: './song-editor-sidebar.component.scss',
})
export class SongEditorSidebarComponent implements OnChanges {
  private confirmation = inject(ConfirmationService);

  facade = inject(SongEditorSidebarFacade);

  @Input({ required: true }) dbId!: string;
  @Input() songId: string | null = null;

  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['dbId'] || changes['songId']) {
      if (!this.dbId) return;
      this.facade.load(this.dbId, this.songId);
    }
  }

  reorderLyrics(event: CdkDragDrop<Lyric[]>): void {
    if (!this.facade.song?.lyrics) {
      return;
    }

    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const nextLyrics = [...this.facade.song.lyrics];
    moveItemInArray(nextLyrics, event.previousIndex, event.currentIndex);
    this.facade.song.lyrics = nextLyrics;
  }

  saveSong(): void {
    if (!this.facade.song) return;

    this.facade.save().subscribe(() => {
      this.saved.emit();
    });
  }

  close(): void {
    this.closed.emit();
  }

  confirmRemoveLyric(index: number, event?: Event): void {
    event?.stopPropagation();

    this.confirmation.confirm({
      target: (event?.currentTarget ?? event?.target) as HTMLElement,
      message: 'Удалить блок?',
      header: 'Подтверждение',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Да',
      rejectLabel: 'Нет',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => this.removeLyric(index),
    });
  }

  private removeLyric(index: number): void {
    if (!this.facade.song || !this.facade.song.lyrics) return;

    const lyrics = [...this.facade.song.lyrics];
    lyrics.splice(index, 1);
    this.facade.song.lyrics = lyrics;
  }
}
