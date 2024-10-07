import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { ILyric, SelectedLyricChunk } from '@lyri-cast/entities';
import { ChooseLyricItemService } from '../../choose-lyric-item.service';
import { filter, map, Observable } from 'rxjs';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'lyri-lyric-item',
  standalone: true,
  imports: [AsyncPipe, JsonPipe, CardModule],
  templateUrl: './lyric-item.component.html',
  styleUrl: './lyric-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LyricItemComponent implements OnInit, OnChanges {
  private chooseLyricItemSrv = inject(ChooseLyricItemService);

  lyricItem = input.required<ILyric>();

  linesChunks$!: Observable<string[][]>;

  selectedBlock$: Observable<SelectedLyricChunk> = this.chooseLyricItemSrv
    .getSelectedLyric()
    .pipe(
      filter(([lyric]) => !!lyric),
      map(([lyric, blockIndex]) => {
        const data = lyric as ILyric;
        return {
          lyric: data,
          blockIndex: blockIndex as number,
          ...data,
        };
      })
    );

  ngOnInit() {
    this.linesChunks$ = this.chooseLyricItemSrv.splitRowCount$
      .asObservable()
      .pipe(
        map((rowSplitCount) => {
          return this.chooseLyricItemSrv.splitIntoChunks(
            this.lyricItem().lines,
            rowSplitCount
          );
        })
      );
  }

  ngOnChanges(changes: SimpleChanges) {
    // if ('lyricItem' in changes) {
    //   this.linesChunks = this.chooseLyricItemSrv.splitIntoChunks(
    //     this.lyricItem().lines
    //   );
    // }
  }

  onSelectBlock(index: number) {
    this.chooseLyricItemSrv.selectItem(this.lyricItem(), index);
  }
}
