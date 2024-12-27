import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ISong, LyricForCasting, LyricLine } from '@lyri-cast/entities';
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
  lyrics = computed<LyricForCasting[]>(() => {
    const lyrics = this.song().lyrics;
    return lyrics.map((el) => {
      const lines = this.songPageSelectSrv.splitArrayIntoParts(el.lines);

      return {
        ...el,
        lines,
      } satisfies LyricForCasting;
    });
  });

  selectedLyricLine = signal<LyricLine | undefined>(undefined);
  selectedLyric = signal<LyricForCasting | undefined>(undefined);

  selectLyricLine = output<[LyricForCasting, LyricLine]>();

  onLineClick(lyric: LyricForCasting, line: LyricLine): void {
    this.selectedLyric.set(lyric);
    this.selectedLyricLine.set(line);
    this.selectLyricLine.emit([lyric, line]);
  }
}
