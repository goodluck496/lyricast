import { inject, Injectable } from '@angular/core';
import { AppWindowTypes } from '@lyri-cast/common-electron';
import { AppActions } from '@lyri-cast/common-browser';
import {
  SongActions,
  SongPageState,
  SongPresentationNavigatePayload,
  SongStartCastingPayload,
} from '../store/index';
import { Store } from '@ngrx/store';
import { selectCastingPaused } from '../store/song.selectors';

@Injectable({ providedIn: 'root' })
export class CastingService {
  private readonly  store = inject(Store<SongPageState>);

  castingPaused$ = this.store.select(selectCastingPaused);

  openCastingPageHandler(data: SongStartCastingPayload): void {
    this.store.dispatch(SongActions.openCasting(data));
  }

  pauseCasting() {
    this.store.dispatch(SongActions.pauseCasting());
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
      SongActions.slideNavigate({
        direction:
          (direction && (direction === 'prev' ? 'prev' : 'next')) || undefined,
        index,
        currentLyric,
      })
    );
  }
}
