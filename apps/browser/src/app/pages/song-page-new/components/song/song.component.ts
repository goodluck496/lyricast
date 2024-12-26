import { Component, computed, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ILyric, ISong } from '@lyri-cast/entities';
import { NgScrollbar } from 'ngx-scrollbar';
import { SongPageSelectService } from '../../song-page-select.service';

@Component({
  selector: 'lyri-song',
  standalone: true,
  imports: [CommonModule, NgScrollbar],
  templateUrl: './song.component.html',
  styleUrl: './song.component.scss',
})
export class SongComponent {
  songPageSelectSrv = inject(SongPageSelectService);

  song = input.required<ISong>();
  lyrics = computed(() => {
    const lyrics = this.song().lyrics;
    console.log(this.songPageSelectSrv.splitPartsCount());
    return lyrics.map((el) => {
      // el.lines = el.lines.map(line => line)

      const lines = this.songPageSelectSrv
        .splitArrayIntoParts(el.lines)
        .map((lines) => lines.join('<br />'));

      return {
        ...el,
        lines,
      } satisfies ILyric;
    });
  });

  selectedLyric = output<ILyric>();

  onLyricSelect(lyric: ILyric) {
    this.selectedLyric.emit(lyric);
  }
}
