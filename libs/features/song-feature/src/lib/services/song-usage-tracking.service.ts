import { inject, Injectable } from '@angular/core';
import { Actions, ofType } from '@ngrx/effects';
import { AppActions, CastingAppearanceService } from '@lyri-cast/common-browser';
import { AppWindowTypes } from '@lyri-cast/common-electron';
import {
  SongActions,
  SongActionsEnum,
  SongStartCastingPayload,
} from '@lyri-cast/song-store';
import {
  SONG_APPEARANCE_SCHEMA_VERSION,
  SongUsageApiService,
} from '@lyri-cast/data-access-song-usage';
import {
  catchError,
  concatMap,
  EMPTY,
  forkJoin,
  map,
  Observable,
  of,
  Subscription,
  switchMap,
  tap,
} from 'rxjs';
import { SongDisplaySettingsService } from './song-display-settings.service';

@Injectable({ providedIn: 'root' })
export class SongUsageTrackingService {
  private readonly actions$ = inject(Actions);
  private readonly api = inject(SongUsageApiService);
  private readonly appearanceService = inject(CastingAppearanceService);
  private readonly displaySettings = inject(SongDisplaySettingsService);

  private readonly subscription = new Subscription();
  private connected = false;
  private currentSessionId: string | null = null;
  private currentPayload: SongStartCastingPayload | null = null;

  connect(): void {
    if (this.connected) {
      return;
    }

    this.connected = true;
    this.subscription.add(
      this.actions$
        .pipe(
          ofType(SongActions[SongActionsEnum.openCasting]),
          concatMap((payload) => this.restartSession(payload))
        )
        .subscribe()
    );

    this.subscription.add(
      this.actions$
        .pipe(
          ofType(
            SongActions[SongActionsEnum.pauseCasting],
            SongActions[SongActionsEnum.stopCasting]
          ),
          concatMap(() => this.finishActiveSession())
        )
        .subscribe()
    );

    this.subscription.add(
      this.actions$
        .pipe(
          ofType(AppActions.closeWindow, AppActions.clearWindowId),
          concatMap((payload) => {
            if ('windowType' in payload && payload.windowType !== AppWindowTypes.CASTING) {
              return of(null);
            }

            return this.finishActiveSession();
          })
        )
        .subscribe()
    );

    this.subscription.add(
      this.actions$
        .pipe(
          ofType(SongActions[SongActionsEnum.updateCastingAppearance]),
          concatMap((appearance) => {
            const payload = this.currentPayload;
            if (!payload) {
              return of(null);
            }

            return this.displaySettings
              .save(payload.song, appearance, payload.splitPartsCount ?? null)
              .pipe(catchError(() => of(null)));
          })
        )
        .subscribe()
    );
  }

  private restartSession(payload: SongStartCastingPayload): Observable<unknown> {
    return this.finishActiveSession().pipe(
      switchMap(() => this.startSession(payload)),
      catchError(() => EMPTY)
    );
  }

  private startSession(payload: SongStartCastingPayload): Observable<unknown> {
    const appearance = payload.appearance ?? this.appearanceService.appearance();
    this.currentPayload = payload;

    return forkJoin({
      session: this.api.startSession({
        songBookKey: payload.song.bookName.fileKey,
        songNumber: payload.song.number,
        songTitle: payload.song.title,
        splitPartsCount: payload.splitPartsCount ?? null,
        appearanceSchemaVersion: SONG_APPEARANCE_SCHEMA_VERSION,
        appearanceSnapshot: appearance,
      }),
      settings: this.displaySettings
        .save(payload.song, appearance, payload.splitPartsCount ?? null)
        .pipe(catchError(() => of(null))),
    }).pipe(
      tap(({ session }) => {
        this.currentSessionId = session.id;
      })
    );
  }

  private finishActiveSession(): Observable<unknown> {
    const sessionId = this.currentSessionId;
    if (!sessionId) {
      return of(null);
    }

    this.currentSessionId = null;
    this.currentPayload = null;

    return this.api.finishSession(sessionId).pipe(
      map(() => null),
      catchError(() => of(null))
    );
  }
}
