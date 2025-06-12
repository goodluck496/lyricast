import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { FreeSlideState } from './free-slide.reducers';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { FreeSlideActions, FreeSlideActionsEnum } from './free-slide.actions';
import { AppWindowTypes, EventData } from '@lyri-cast/common-electron';
import { map } from 'rxjs';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [FreeSlideActionsEnum.startCasting]: (eventData: EventData) =>
    FreeSlideActions.startCasting(eventData.payload as any),
  [FreeSlideActionsEnum.castingStarted]: () =>
    FreeSlideActions.castingStarted(),
  [FreeSlideActionsEnum.stopCasting]: () => FreeSlideActions.stopCasting(),
  [FreeSlideActionsEnum.pauseCasting]: () => FreeSlideActions.pauseCasting(),
};

/**
 * Сервис эффектов для страницы CASTING`а, createCastingFlow применять нельзя,
 * т.к. это принимающий сервис, а не инициатор
 */
@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class FreeSlideForCastingEffects
  implements BaseEffectsWithBridgeInterface
{
  public readonly store = inject<Store<FreeSlideState>>(Store);
  public readonly bridge = inject(BridgeService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly window = inject(WindowService);
  private readonly actions$ = inject(Actions);

  openCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FreeSlideActions.openCasting),
      map((data) => {
        console.log('opencasting', data);
        return { type: FreeSlideActionsEnum.openCasting };
      })
    )
  );

  stopCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FreeSlideActions.stopCasting),
      map(() => {
        return AppActions.closeWindow({
          windowType: AppWindowTypes.CASTING,
        });
      })
    )
  );
}
