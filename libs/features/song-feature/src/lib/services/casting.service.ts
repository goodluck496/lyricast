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

@Injectable({ providedIn: 'root' })
export class CastingService {
  private store = inject(Store<SongPageState>);

  openCastingPageHandler(data: SongStartCastingPayload): void {
    this.store.dispatch(SongActions.openCasting(data));
  }

  pauseCasting() {
    this.store.dispatch(SongActions.pauseCasting());
  }

  closeCasting() {
    this.store.dispatch(
      AppActions.closeWindow({
        windowType: AppWindowTypes.SONG_CASTING,
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
