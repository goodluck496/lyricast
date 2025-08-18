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
  }

  private decideParts(lyric: Lyric, globalParts: SplitPartsCount, arrLen: number): number {
    if (lyric.splitLinesCount === 0) return 1;                               // явно «не делить»
    if (typeof lyric.splitLinesCount === 'number' && lyric.splitLinesCount > 0) {
      return Math.min(lyric.splitLinesCount, arrLen);                         // локальный override
    }
    if (globalParts === SPLIT_PARTS_COUNT.NONE || globalParts > arrLen) {
      return 1;                                                               // глобально «не делить»
    }
    const p = Number(globalParts || 1);
    return Math.max(1, Math.min(p, arrLen));
  }

  private buildLyricsForCasting(song: ISong): LyricForCasting[] {
    const globalParts = this.splitPartsCount();
    const counts = song.lyrics.map(l => this.decideParts(l, globalParts, l.lines.length));

    // префиксные суммы стартовых оффсетов
    const offsets: number[] = [];
    let acc = 0;
    for (let i = 0; i < counts.length; i++) {
      offsets.push(acc);
      acc += counts[i];
    }

    return song.lyrics.map((lyric, i) => {
      const lines = this.splitArrayIntoParts(lyric, i, offsets[i]);
      return { ...lyric, lines } as LyricForCasting;
    });
  }


  public splitArrayIntoParts(
    lyric: Lyric,
    lyricIndex: number,
    startOffset = 0
  ): LyricLine[] {
    const arr = lyric.lines;
    const parts = this.decideParts(lyric, this.splitPartsCount(), arr.length);

    // один блок — весь текст подряд
    if (parts === 1) {
      return [{
        rangeIndex: `0-${Math.max(0, arr.length - 1)}`,
        index: 0,                               // индекс части внутри этого lyric
        globalSongIndex: startOffset + 0,       // кумулятивный уровень
        text: arr.join('<br />'),
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
    return buckets.map((lines, partIdx) => {
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
