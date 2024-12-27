import { Injectable } from '@angular/core';
import { Lyric } from '@lyri-cast/entities';
import { BehaviorSubject, combineLatest, debounceTime } from 'rxjs';

@Injectable()
export class ChooseLyricItemService {
  selectedLyric$ = new BehaviorSubject<Lyric | null>(null);
  selectedLinesBlockIndex$ = new BehaviorSubject<number | null>(null);

  public splitRowCount$ = new BehaviorSubject(4);

  selectItem(lyric: Lyric, blockIndex: number) {
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

    const newArr = [];
    const maxCharInRow = 35;

    function findDivisors(num: number): number[] {
      const divisors = [];

      for (let i = 1; i <= num; i++) {
        if (num % i === 0) {
          divisors.push(i);
        }
      }

      return divisors;
    }

    for (let i = 0; i < arr.length; i++) {
      const row = arr[i].trim();
      if (row.length > maxCharInRow) {
        const rowChunks = row.trim().split(' ');
        let rowChunkIndex = 0;
        const newRowArr = []
        while (newRowArr.join(' ').length <= maxCharInRow) {
          newRowArr.push(rowChunks[rowChunkIndex]);
          rowChunkIndex++;
        }
        newArr.push(newRowArr.join(' ').trim());

        if (newRowArr.join(' ').trim().length < row.length) {
          newArr.push(rowChunks.slice(rowChunkIndex).join(' '));
        }
      } else {
        newArr.push(row)
      }
    }


    const divisions = findDivisors(newArr.length);
    const newChunkSize = divisions.includes(chunkSize)
      ? chunkSize
      : divisions.length > 2
      ? divisions[divisions.length - 2]
      : divisions[divisions.length - 1];



    for (let i = 0; i < newArr.length; i += newChunkSize) {
      const chunk = newArr.slice(i, i + chunkSize);
      result.push(chunk);
    }

    console.log('arr', arr, newArr, chunkSize, newChunkSize, result, divisions);

    return result;
  }
}
