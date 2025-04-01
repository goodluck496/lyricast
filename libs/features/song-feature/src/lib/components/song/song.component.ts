import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ISong, LyricForCasting, LyricLine } from '@lyri-cast/entities';
import { NgScrollbar } from 'ngx-scrollbar';
import { SongPageSelectService } from '../../pages/song-page/song-page-select.service';
import { DblClickDirective } from '@lyri-cast/ui-lib';
import { DomHandler } from 'primeng/dom';

@Component({
  selector: 'lyri-song',
  standalone: true,
  imports: [CommonModule, NgScrollbar, DblClickDirective],
  templateUrl: './song.component.html',
  styleUrl: './song.component.scss',
})
export class SongComponent {
  songPageSelectSrv = inject(SongPageSelectService);
  elRef = inject(ElementRef);

  song = input.required<ISong>();
  lyrics = computed<LyricForCasting[]>(() =>
    this.songPageSelectSrv.selectedLyricsForCasting()
  );
  lyricItems = viewChildren<ElementRef<HTMLElement>>('lyricItem');

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
        this.scrollToSelected();
        this.elRef.nativeElement.focus();
      },
      { allowSignalWrites: true }
    );

    effect(() => {
      const lyrics = this.lyrics();
      const lines = lyrics[0];
      this.onLineClick(lines, lines.lines[0], false);
    }, {allowSignalWrites: true});
  }

  onLineClick(
    lyric: LyricForCasting,
    line: LyricLine,
    startPresentation = false
  ): void {
    this.selectedLyric.set(lyric);
    this.selectedLyricLine.set(line);
    this.scrollToSelected();

    this.selectLyricLine.emit([lyric, line, startPresentation]);
  }

  scrollToSelected() {
    setTimeout(() => {
      this.lyricItems().forEach((item) => {
        if (
          DomHandler.hasClass(item.nativeElement, 'lyric-item__line--selected')
        ) {
          /**
           * работает хуже чем нативный scrollIntoView
           */
          // this.scrollBar().scrollToElement(item);
          item.nativeElement.scrollIntoView({
            block: 'center',
            behavior: 'smooth',
          });
        }
      });
    }, 1000);
  }
}
