import {
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { ISong, Lyric, LyricForCasting, LyricLine } from '@lyri-cast/entities';
import { NgScrollbar } from 'ngx-scrollbar';
import { SongPageSelectService } from '../../pages/song-page/song-page-select.service';
import { DblClickDirective } from '@lyri-cast/ui-lib';
import { DomHandler } from 'primeng/dom';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { TourAnchorPrimeNgDirective } from 'ngx-ui-tour-primeng';

@Component({
  selector: 'lyri-song',
  standalone: true,
  imports: [
    NgScrollbar,
    DblClickDirective,
    ButtonModule,
    TooltipModule,
    ToggleSwitchModule,
    FormsModule,
    TourAnchorPrimeNgDirective,
  ],
  templateUrl: './song.component.html',
  styleUrl: './song.component.scss',
})
export class SongComponent {
  songPageSelectSrv = inject(SongPageSelectService);
  elRef = inject(ElementRef);
  sanitizer: DomSanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);

  song = input.required<ISong>();
  private readonly localUpdatedLyrics = signal<Lyric[] | null>(null);
  lyrics = computed<LyricForCasting[]>(() => {
    const baseSong = this.song();
    const local = this.localUpdatedLyrics();
    const currentSong: ISong = local ? { ...baseSong, lyrics: local } : baseSong;
    this.songPageSelectSrv.splitPartsCount();
    return this.songPageSelectSrv.buildLyricsForCasting(currentSong);
  });
  lyricItems = viewChildren<ElementRef<HTMLElement>>('lyricItem');

  editingLyricIndex = signal<number | null>(null);
  editingLyricText = signal<string>('');
  editableBlock = viewChild<ElementRef<HTMLDivElement>>('editableBlock');

  selectedLyricLine = signal<LyricLine | null>(null);
  selectedLyric = signal<LyricForCasting | undefined>(undefined);

  selectLyricLine = output<[LyricForCasting, LyricLine, boolean]>();
  songUpdated = output<ISong>();

  constructor() {
    effect(() => {
      this.song();
      this.localUpdatedLyrics.set(null);
    });

    effect(() => {
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
    });

    effect(() => {
      //todo выбор первого куплетьа пока отключил, возможно не понадобится
      // const lyrics = this.lyrics();
      // const lines = lyrics[0];
      // this.onLineClick(lines, lines.lines[0], false);
    });
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

  isLyricSplit(lyric: LyricForCasting): boolean {
    return this.songPageSelectSrv.isLyricSplit(lyric);
  }

  onToggleLyricSplit(lyric: LyricForCasting, split: boolean): void {
    this.songPageSelectSrv.setLyricSplitOverride(lyric.uniqId, split);
  }

  getLyricLinesCount(lyric: LyricForCasting): number {
    const flattened = lyric.lines
      .map((l) => (typeof l === 'string' ? l : l.text).split(/<br\s*\/?>/i))
      .flat()
      .filter((t) => t.trim().length > 0);
    return flattened.length;
  }

  private scrollTimeout: any;

  scrollToSelected() {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    this.scrollTimeout = setTimeout(() => {
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
    }, 300);
  }

  startEditing(index: number, lyric: LyricForCasting, event: MouseEvent): void {
    event.stopPropagation();
    this.editingLyricIndex.set(index);

    const originalLyric = this.song().lyrics[index];
    const linesSource =
      originalLyric?.lines && originalLyric.lines.length > 0
        ? originalLyric.lines
        : lyric?.lines && lyric.lines.length > 0
        ? lyric.lines
        : [];
    const text = linesSource
      .map((l) => {
        if (typeof l === 'string') {
          return l;
        }
        return (l?.text ?? '').replace(/<br\s*\/?>/gi, '\n');
      })
      .join('\n');

    this.editingLyricText.set(text);
    this.cdr.detectChanges();

    const applyEditorContent = () => {
      const el = this.editableBlock()?.nativeElement;
      if (el) {
        if (!el.innerText || el.innerText.trim() !== text.trim()) {
          el.innerText = text;
        }
        el.focus();

        try {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(el);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        } catch {
          // ignore selection errors in test or headless environments
        }
      }
    };

    applyEditorContent();
    queueMicrotask(() => applyEditorContent());
  }

  cancelEditing(event?: Event): void {
    event?.stopPropagation();
    this.editingLyricIndex.set(null);
    this.editingLyricText.set('');
  }

  saveEditing(index: number, event?: Event): void {
    event?.stopPropagation();
    const el = this.editableBlock()?.nativeElement;
    if (!el) {
      this.editingLyricIndex.set(null);
      this.editingLyricText.set('');
      return;
    }

    const text = el.innerText ?? el.textContent ?? '';
    const rawLines = text
      .split(/\r?\n|\r/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (rawLines.length === 0) {
      this.editingLyricIndex.set(null);
      this.editingLyricText.set('');
      return;
    }

    const newLines: LyricLine[] = rawLines.map((lineText, idx) => ({
      rangeIndex: `${idx}`,
      index: idx,
      globalSongIndex: idx,
      text: lineText,
    }));

    const currentSong = this.song();
    const updatedLyrics: Lyric[] = currentSong.lyrics.map((l, i) => {
      if (i === index) {
        return {
          ...l,
          uniqId: `${l.uniqId.split('_v')[0]}_v${Date.now()}`,
          lines: newLines,
        };
      }
      return l;
    });

    this.localUpdatedLyrics.set(updatedLyrics);

    const updatedSong: ISong = {
      ...currentSong,
      lyrics: updatedLyrics,
    };

    this.editingLyricIndex.set(null);
    this.editingLyricText.set('');
    this.songUpdated.emit(updatedSong);
  }

  onEditorKeydown(event: KeyboardEvent, index: number): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditing(event);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.saveEditing(index, event);
    }
  }
}
