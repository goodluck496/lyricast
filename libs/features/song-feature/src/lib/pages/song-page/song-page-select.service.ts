import { computed, Injectable, signal } from '@angular/core';
import { ISong, LyricForCasting, LyricLine } from '@lyri-cast/entities';
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
    if (!song) {
      return [];
    }
    const lyrics = song.lyrics;
    const result: LyricForCasting[] = lyrics.map((el, i) => {
      const lines = this.splitArrayIntoParts(el.lines, i);

      return {
        ...el,
        lines,
      } satisfies LyricForCasting;
    });

    return result;
  });

  private _isShowPreview = new Subject();
  public isShowPreview = this._isShowPreview.asObservable();

  public getStartCastingPayload(
    fromSelectedBlock = false
  ): SongStartCastingPayload | undefined {
    const song = this.selectedSong();
    if (!song) {
      return;
    }

    const lyrics = song.lyrics.map((lyric, index) => {
      return {
        ...lyric,
        lines: this.splitArrayIntoParts(lyric.lines, index),
      };
    });

    const selectedLyric = this.selectedLyric();
    const fromIndex = fromSelectedBlock
      ? this.selectedLyricLine()?.globalSongIndex
      : undefined;

    return {
      song,
      lyrics,
      fromIndex,
      currentLyric: selectedLyric ? selectedLyric : lyrics[0],
    };
  }

  public getNavigatePayload(
    dir: 'prev' | 'next'
  ): SongPresentationNavigatePayload | undefined {
    const lyric = this.selectedLyric;
    const song = this.selectedSong();
    if (!lyric || !song) {
      return;
    }

    const currentLyricLine = this.selectedLyricLine();
    if (!currentLyricLine) {
      return;
    }
    const nextGlobalIndex =
      dir === 'next'
        ? currentLyricLine.globalSongIndex + 1
        : currentLyricLine.globalSongIndex - 1;
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
    };
  }

  public setSplitCountValue(value: SplitPartsCount) {
    this.splitPartsCount.set(value);
  }

  public selectSong(song: ISong | null) {
    this.selectedSong.set(song);
  }

  public splitArrayIntoParts(arr: string[], lyricIndex: number): LyricLine[] {
    const parts = this.splitPartsCount();
    if (parts === SPLIT_PARTS_COUNT.NONE || parts > arr.length) {
      return [
        {
          rangeIndex: `0-${arr.length}`,
          index: 0,
          globalSongIndex: lyricIndex,
          text: arr.join('<br />'),
        },
      ];
    }

    const preparedArr: LyricLine[] = arr.map((el, i) => ({
      rangeIndex: `${i}`,
      index: i,
      globalSongIndex: lyricIndex * parts + i,
      text: el,
    }));

    const result: LyricLine[][] = [];
    const partSize = Math.floor(arr.length / parts);
    let remainder = arr.length % parts;
    let start = 0;

    for (let i = 0; i < parts; i++) {
      const end = start + partSize + (remainder > 0 ? 1 : 0);
      result.push(preparedArr.slice(start, end));
      start = end;
      if (remainder > 0) {
        remainder--;
      }
    }

    return result.map((lines, index) => {
      const objLyricLine = lines.reduce(
        (acc, curr) => {
          acc.text.push(curr.text);
          acc.rangeIndex.push(curr.rangeIndex);
          acc.index.push(curr.index);

          return acc;
        },
        {
          rangeIndex: [] as string[],
          index: [] as number[],
          globalSongIndex: [] as number[],
          text: [] as string[],
        }
      );

      return {
        rangeIndex: [
          String(Math.min(...objLyricLine.index)),
          String(Math.max(...objLyricLine.index)),
        ].join('-'),
        index: index,
        globalSongIndex: index + lyricIndex * parts,
        text: objLyricLine.text.join('<br />'),
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
  }
}
