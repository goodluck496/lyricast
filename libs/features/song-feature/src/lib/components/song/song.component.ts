import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ISong, LyricForCasting, LyricLine } from '@lyri-cast/entities';
import { NgScrollbar } from 'ngx-scrollbar';
import { SongPageSelectService } from '../../pages/song-page/song-page-select.service';
import { DblClickDirective } from '@lyri-cast/ui-lib';

@Component({
  selector: 'lyri-song',
  standalone: true,
  imports: [CommonModule, NgScrollbar, DblClickDirective],
  templateUrl: './song.component.html',
  styleUrl: './song.component.scss',
})
export class SongComponent {
  songPageSelectSrv = inject(SongPageSelectService);

  song = input.required<ISong>();
  lyrics = computed<LyricForCasting[]>(() =>
    this.songPageSelectSrv.selectedLyricsForCasting()
  );

  selectedLyricLine = signal<LyricLine | null>(null);
  selectedLyric = signal<LyricForCasting | undefined>(undefined);

  selectLyricLine = output<[LyricForCasting, LyricLine, boolean]>();

  constructor() {
    effect(
      () => {
        const selectedLyricLine = this.songPageSelectSrv.selectedLyricLine();
        if (selectedLyricLine) {
          this.selectedLyricLine.set(selectedLyricLine);
        }
        const selectedLyric = this.songPageSelectSrv.selectedLyric();
        if (selectedLyric) {
          this.selectedLyric.set(selectedLyric);
        }
      },
      { allowSignalWrites: true }
    );
  }

  onLineClick(
    lyric: LyricForCasting,
    line: LyricLine,
    startPresentation = false
  ): void {
    this.selectedLyric.set(lyric);
    this.selectedLyricLine.set(line);

    this.selectLyricLine.emit([lyric, line, startPresentation]);
  }
}
