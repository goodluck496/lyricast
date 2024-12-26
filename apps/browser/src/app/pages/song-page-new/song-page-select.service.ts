import { Injectable, signal } from '@angular/core';
import { ISong } from '@lyri-cast/entities';

export const SPLIT_PARTS_COUNT = {
  NONE: -1,
  FOUR: 4,
  TWO: 2,
  THREE: 3,
} as const;

export type SplitPartsCount =
  (typeof SPLIT_PARTS_COUNT)[keyof typeof SPLIT_PARTS_COUNT];

@Injectable()
export class SongPageSelectService {
  public splitPartsCount = signal<SplitPartsCount>(SPLIT_PARTS_COUNT.NONE);
  private selectedSong?: ISong;

  public setSplitCountValue(value: SplitPartsCount) {
    this.splitPartsCount.set(value);
  }

  public selectSong(song: ISong) {
    this.selectedSong = song;
  }

  public splitArrayIntoParts(arr: string[]): string[][] {
    const parts = this.splitPartsCount();
    if (parts === SPLIT_PARTS_COUNT.NONE || parts >= arr.length) {
      return [arr];
    }
    const result: string[][] = [];
    const partSize = Math.floor(arr.length / parts);
    let remainder = arr.length % parts;
    let start = 0;
    for (let i = 0; i < parts; i++) {
      const end = start + partSize + (remainder > 0 ? 1 : 0);
      result.push(arr.slice(start, end));
      start = end;
      remainder--;
    }
    return result;
  }
}
