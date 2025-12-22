import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { concatMap, Observable, take } from 'rxjs';
import { NavigatorActions, selectHistory, selectHistoryByType } from '../store';
import {
  HistoryItem,
  HistoryType,
  LyricHistoryItem,
  SongHistoryItem,
} from './history.types';
import { BibleActions } from '@lyri-cast/bible-store';
import { Router } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { SongActions, SongActionsEnum } from '@lyri-cast/song-store';
import { Actions, ofType } from '@ngrx/effects';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private store = inject(Store);
  private actions$ = inject(Actions);
  private router = inject(Router);

  add(item: HistoryItem): void {
    this.store.dispatch(NavigatorActions.push({ data: item }));
  }

  clear(): void {
    this.store.dispatch(NavigatorActions.clear());
  }

  getAll(): Observable<HistoryItem[]> {
    return this.store.select(selectHistory);
  }

  getByType<R extends HistoryItem>(type: HistoryType): Observable<R[]> {
    return this.store.select(selectHistoryByType(type)) as Observable<R[]>;
  }

  async selectHistoryItem(item: HistoryItem): Promise<void> {
    this.store.dispatch(NavigatorActions.select({ key: item.payload.key }));

    switch (item.type) {
      case HistoryType.SELECT_LYRIC:
        await this.handleSelectLyric(item);
        break;
      case HistoryType.SELECT_SONG:
        await this.ensurePageActive([
          Pages.MAIN,
          Pages.SONGS_FEATURE,
          Pages.SONGS,
        ]);
        break;
      case HistoryType.BIBLE:
        await this.ensurePageActive([
          Pages.MAIN,
          Pages.BIBLE_FEATURE,
          Pages.BIBLE,
        ]);
        this.store.dispatch(
          BibleActions.changePath({ path: item.payload.path })
        );

        if (item.payload.range) {
          this.store.dispatch(
            BibleActions.selectVersesRange({
              from: item.payload.range.from,
              to: item.payload.range.to,
            })
          );
        }
        break;
    }
  }

  private async handleSelectLyric(item: LyricHistoryItem): Promise<void> {
    this.getByType<SongHistoryItem>(HistoryType.SELECT_SONG)
      .pipe(take(1))
      .subscribe(async (songs) => {
        const foundSong = songs.find(
          (el) => el.payload.entityId === item.payload.parent.entityId
        );

        if (!foundSong) return;

        await this.ensurePageActive([
          Pages.MAIN,
          Pages.SONGS_FEATURE,
          Pages.SONGS,
        ]);

        setTimeout(() =>
          this.store.dispatch(
            SongActions[SongActionsEnum.selectBook](foundSong.payload.bookName)
          )
        );

        this.actions$
          .pipe(
            ofType(SongActions[SongActionsEnum.selectBook]),
            take(1),
            concatMap(() => {
              this.store.dispatch(
                SongActions[SongActionsEnum.selectSongByNumber]({
                  data: { number: foundSong.payload.entity.number },
                })
              );
              return this.actions$.pipe(
                ofType(SongActions[SongActionsEnum.selectSong]),
                take(1)
              );
            })
          )
          .subscribe(() => {
            this.store.dispatch(
              SongActions[SongActionsEnum.slideNavigate]({
                ...item.payload.actionData,
                fromService: true,
              })
            );
          });
      });
  }

  private async ensurePageActive(path: string[]): Promise<void> {
    const isActive = this.router.isActive(path.join('/'), {
      paths: 'exact',
      queryParams: 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
    if (!isActive) {
      await this.router.navigate(path);
    }
  }
}
