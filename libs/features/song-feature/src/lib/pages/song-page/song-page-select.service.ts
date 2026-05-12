import { computed, Injectable, signal } from '@angular/core';
import { ISong, Lyric, LyricForCasting, LyricLine } from '@lyri-cast/entities';
import { Subject } from 'rxjs';
import {
  SongPresentationNavigatePayload,
  SongStartCastingPayload,
} from '@lyri-cast/song-store';

export const SPLIT_PARTS_COUNT = {
  NONE: -1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
} as const;

export type SplitPartsCount =
  | (typeof SPLIT_PARTS_COUNT)[keyof typeof SPLIT_PARTS_COUNT]
  | number;

@Injectable()
export class SongPageSelectService {
  public splitPartsCount = signal<SplitPartsCount>(SPLIT_PARTS_COUNT.NONE);
  public selectedSong = signal<ISong | null>(null);
  public selectedLyricLine = signal<LyricLine | null>(null);
  public selectedLyric = signal<LyricForCasting | null>(null);
  public selectedLyricsForCasting = computed(() => {
    const song = this.selectedSong();
    this.splitPartsCount();
    if (!song) return [];
    return this.buildLyricsForCasting(song);
  });

  private _isShowPreview = new Subject();
  public isShowPreview = this._isShowPreview.asObservable();

  public getStartCastingPayload(fromSelectedBlock = false): SongStartCastingPayload | undefined {
    const song = this.selectedSong();
    if (!song) return;

    // важный момент: НЕ пересчитываем по-старому,
    // а берём точно те же разбиения и globalSongIndex, что и в selectedLyricsForCasting
    const lyrics = this.buildLyricsForCasting(song);

    const selectedLyric = this.selectedLyric();
    const fromIndex = fromSelectedBlock ? this.selectedLyricLine()?.globalSongIndex : undefined;

    return {
      song,
      lyrics,
      fromIndex,
      currentLyric: selectedLyric ?? lyrics[0],
      splitPartsCount: this.splitPartsCount(),
    };
  }

  /**
   *
   * @param dir - направление навигации
   * @param forceIndex - если указан, то индексом презентации будет взят именно этот параметр
   */
  public getNavigatePayload(
    dir: 'prev' | 'next',
    forceIndex?: number
  ): SongPresentationNavigatePayload | undefined {
    const lyric = this.selectedLyric();
    const song = this.selectedSong();
    if (!lyric || !song) {
      return;
    }

    const currentLyricLine = this.selectedLyricLine();
    if (!currentLyricLine) {
      return;
    }
    let nextGlobalIndex =
      dir === 'next'
        ? currentLyricLine.globalSongIndex + 1
        : currentLyricLine.globalSongIndex - 1;
    if (forceIndex !== undefined) {
      nextGlobalIndex = forceIndex;
    }
    const lyrics = this.selectedLyricsForCasting();
    const lyricsLines = lyrics.map((el) => el.lines).flat();
    const nextLine = lyricsLines.find(
      (el) => el.globalSongIndex === nextGlobalIndex
    );

    if (!nextLine) {
      return;
    }

    const nextLyric = lyrics.find(
      (el) =>
        el.lines.findIndex((el1) => el1.globalSongIndex === nextGlobalIndex) >=
        0
    );
    if (!nextLyric) {
      return;
    }

    this.showPreview(true, nextLyric, nextLine);

    return {
      direction: dir,
      currentLyric: nextLyric,
      index: nextGlobalIndex,
    };
  }

  public setSplitCountValue(value: SplitPartsCount) {
    this.splitPartsCount.set(value);
  }

  public selectSong(song: ISong | null) {
    this.selectedSong.set(song);
    this.selectedLyricLine.set(null);
    this.selectedLyric.set(null);
  }

  private getFlattenedLines(lyric: Lyric): string[] {
    return lyric.lines
      .map(l => l.text.split(/<br\s*\/?>/i))
      .flat()
      .filter(t => t.trim().length > 0);
  }

  private decideParts(lyric: Lyric, globalParts: SplitPartsCount, arrLen: number): number {
    // Если пользователь выбрал "Не делить", строго возвращаем 1 блок для любой секции
    if (globalParts === SPLIT_PARTS_COUNT.NONE) {
      return 1;
    }

    const p = Number(globalParts || 1);
    const isExplicitlyUndivided = lyric.splitLinesCount === 0;
    
    // If it's a CHORUS or explicitly undivided section, and the requested parts 
    // isn't significantly overriding a huge block, we keep it as 1 to match expectations
    // that choruses shouldn't blindly split just because couplets do.
    if (isExplicitlyUndivided && (lyric.type === 'CHORUS' || lyric.type === 'END')) {
       // Only force divide a chorus if it's REALLY long (e.g. > 4 lines)
       if (arrLen <= 4) {
         return 1; 
       }
    }
    
    return Math.max(1, Math.min(p, arrLen));
  }

  public buildLyricsForCasting(song: ISong): LyricForCasting[] {
    const globalParts = this.splitPartsCount();
    const counts = song.lyrics.map(l => {
      const linesArr = this.getFlattenedLines(l);
      return this.decideParts(l, globalParts, linesArr.length);
    });

    // префиксные суммы стартовых оффсетов
    const offsets: number[] = [];
    let acc = 0;
    for (let i = 0; i < counts.length; i++) {
      offsets.push(acc);
      acc += counts[i];
    }

    return song.lyrics.map((lyric, i) => {
      const lines = this.splitArrayIntoParts(lyric, i, offsets[i], globalParts);
      // Create a fresh unique ID based on the payload so Angular's @for track detects deep changes 
      // when we change split configuration for the same lyric chunk.
      // Append `_split_${lines.length}` to ensure trackBy picks up the structural change.
      return { 
        ...lyric, 
        uniqId: `${lyric.uniqId}_split_${lines.length}`,
        lines 
      } as LyricForCasting;
    });
  }

  public splitArrayIntoParts(
    lyric: Lyric,
    lyricIndex: number,
    startOffset = 0,
    globalParts: SplitPartsCount
  ): LyricLine[] {
    const arr = this.getFlattenedLines(lyric);
    const parts = this.decideParts(lyric, globalParts, arr.length);

    // один блок — весь текст подряд
    if (parts === 1 || arr.length === 0) {
      return [{
        rangeIndex: `0-${Math.max(0, arr.length - 1)}`,
        index: 0,                               // индекс части внутри этого lyric
        globalSongIndex: startOffset + 0,       // кумулятивный уровень
        text: arr.length > 0 ? arr.join('<br />') : lyric.lines.map(l => l.text).join('<br />'),
      }];
    }

    // подготовка
    const prepared = arr.map((text, i) => ({ text, i }));
    const buckets: typeof prepared[] = [];
    const base = Math.floor(arr.length / parts);
    let rem = arr.length % parts;
    let s = 0;

    for (let p = 0; p < parts; p++) {
      const e = s + base + (rem > 0 ? 1 : 0);
      buckets.push(prepared.slice(s, e));
      s = e;
      if (rem > 0) rem--;
    }

    // склеиваем часть → LyricLine
    return buckets.filter(b => b.length > 0).map((lines, partIdx) => {
      const minIdx = Math.min(...lines.map(l => l.i));
      const maxIdx = Math.max(...lines.map(l => l.i));
      return {
        rangeIndex: `${minIdx}-${maxIdx}`,
        index: partIdx,                         // индекс части внутри этого lyric
        globalSongIndex: startOffset + partIdx, // кумулятивный
        text: lines.map(l => l.text).join('<br />'),
      } satisfies LyricLine;
    });
  }



  public showPreview(
    state: boolean,
    lyric: LyricForCasting,
    lyricLine: LyricLine
  ): void {
    this.selectedLyricLine.set(lyricLine);
    this.selectedLyric.set(lyric);
    this._isShowPreview.next(state);
    // console.log(lyricLine, lyric, state);
  }
}
