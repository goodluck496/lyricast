import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { NavigatorActions, selectHistory, selectHistoryByType } from '../store';
import { HistoryItem, HistoryType } from './history.types';
import { BibleActions } from '@lyri-cast/bible-store';
import { Router } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private store = inject(Store);
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

  getByType(type: HistoryType): Observable<HistoryItem[]> {
    return this.store.select(selectHistoryByType(type));
  }

  selectHistoryItem(item: HistoryItem): void {
    console.log(item);

    if (item.type === HistoryType.SELECT_SONG) {
      this.router
        .navigate([Pages.MAIN, Pages.SONGS_FEATURE, Pages.SONGS])
        .then();
    }
    if (item.type === HistoryType.BIBLE) {
      this.router
        .navigate([Pages.MAIN, Pages.BIBLE_FEATURE, Pages.BIBLE])
        .then(() => {
          //todo доделать выбор перевода
          this.store.dispatch(
            BibleActions.changePath({ path: item.payload.path })
          );
        });
    }
  }
}
