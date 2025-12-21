import { inject, Injectable } from '@angular/core';
import { AppWindowTypes } from '@lyri-cast/common-electron';
import { AppActions } from '@lyri-cast/common-browser';
import {
  SongActions,
  SongActionsEnum,
  SongPageState,
  SongPresentationNavigatePayload,
  SongStartCastingPayload,
  selectCastingPaused
} from '@lyri-cast/song-store';
import { Store } from '@ngrx/store';
import { Observable, tap } from 'rxjs';
import { Actions, ofType } from '@ngrx/effects';

@Injectable({ providedIn: 'root' })
export class CastingService {
  private readonly  store = inject(Store<SongPageState>);
  private readonly actions$ = inject(Actions);

  castingPaused$ = this.store.select(selectCastingPaused);

  openCastingPageHandler(data: SongStartCastingPayload): void {
    this.store.dispatch(SongActions[SongActionsEnum.openCasting](data));
  }

  pauseCasting() {
    this.store.dispatch(SongActions[SongActionsEnum.pauseCasting]());
  }

  closeCasting() {
    this.store.dispatch(
      AppActions.closeWindow({
        windowType: AppWindowTypes.CASTING,
      })
    );
  }

  navigateSlide({
    direction,
    index,
    currentLyric,
  }: SongPresentationNavigatePayload): void {
    this.store.dispatch(
      SongActions[SongActionsEnum.slideNavigate]({
        direction:
          (direction && (direction === 'prev' ? 'prev' : 'next')) || undefined,
        index,
        currentLyric,
      })
    );
  }
}
