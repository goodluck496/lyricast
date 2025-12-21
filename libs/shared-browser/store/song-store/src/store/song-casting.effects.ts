import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { SongPageState } from './song.reducers';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { SongActions, SongActionsEnum } from './song.actions';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  WindowService,
} from '@lyri-cast/common-browser';
import { EventData } from '@lyri-cast/common-electron';
import { map } from 'rxjs';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [SongActionsEnum.startCasting]: (eventData: EventData) =>
    SongActions[SongActionsEnum.startCasting](eventData.payload as any),
  [SongActionsEnum.pauseCasting]: () =>
    SongActions[SongActionsEnum.pauseCasting](),
  [SongActionsEnum.slideNavigate]: (eventData) =>
    SongActions[SongActionsEnum.slideNavigate](eventData.payload as any),
  [SongActionsEnum.stopCasting]: () =>
    SongActions[SongActionsEnum.stopCasting](),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class SongForCastingEffects implements BaseEffectsWithBridgeInterface {
  actions$ = inject(Actions);
  store = inject(Store<SongPageState>);
  bridge = inject(BridgeService);

  private readonly window = inject(WindowService);

  stopCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions[SongActionsEnum.stopCasting]),
      map(() => ({ type: '[SongForCastingEffects] stopCasting received' }))
    )
  );
}
