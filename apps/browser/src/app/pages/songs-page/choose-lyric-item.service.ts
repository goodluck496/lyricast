import { Injectable } from '@angular/core';
import { ILyric } from '@lyri-cast/entities';
import { BehaviorSubject, combineLatest, debounceTime } from 'rxjs';

@Injectable()
export class ChooseLyricItemService {
  selectedLyric$ = new BehaviorSubject<ILyric | null>(null);
  selectedLinesBlockIndex$ = new BehaviorSubject<number | null>(null);

  public splitRowCount$ = new BehaviorSubject(4);

  selectItem(lyric: ILyric, blockIndex: number) {
    this.selectedLyric$.next(lyric);
    this.selectedLinesBlockIndex$.next(blockIndex);
  }

  getSelectedLyric() {
    return combineLatest([
      this.selectedLyric$.asObservable(),
      this.selectedLinesBlockIndex$.asObservable(),
    ]).pipe(debounceTime(0));
  }

  reset(): void {
    this.selectedLyric$.next(null);
    this.selectedLinesBlockIndex$.next(null);
  }

  splitIntoChunks(arr: string[], chunkSize = 4): string[][] {
    const result = [];

    for (let i = 0; i < arr.length; i += chunkSize) {
      const chunk = arr.slice(i, i + chunkSize);
      result.push(chunk);
    }

    return result;
  }
}
