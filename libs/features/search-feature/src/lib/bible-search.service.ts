import { inject, Injectable, signal } from '@angular/core';
import { BehaviorSubject, of, switchMap, tap } from 'rxjs';
import { BibleSearchDto } from '@lyri-cast/entities';
import { BibleApiService } from '@lyri-cast/data-access-bible';

import { Store } from '@ngrx/store';
import { BibleState, selectSelectedTranslate } from '@lyri-cast/bible-store';
import { filterEmpty } from '@lyri-cast/common';

@Injectable()
export class BibleSearchService {
  apiSrv = inject(BibleApiService);

  store = inject<Store<BibleState>>(Store);

  isLoading = signal(false);

  searchResult$ = new BehaviorSubject<BibleSearchDto>({
    search: '',
    sections: [],
  });

  public search(query: string) {
    if (!query.length) {
      const data: BibleSearchDto = { search: '', sections: [] };

      this.searchResult$.next(data);
      return of(data);
    }

    const translate$ = this.store.select(selectSelectedTranslate);
    this.isLoading.set(true);

    if (this.searchResult$.value.search === query) {
      this.isLoading.set(false);
      return this.searchResult$.asObservable();
    }

    return translate$.pipe(
      filterEmpty(),
      switchMap((translate) => {
        return this.apiSrv.search(translate, {
          query,
        });
      }),
      tap((v) => {
        this.searchResult$.next(v);
        this.isLoading.set(false);
      })
    );
  }
}
