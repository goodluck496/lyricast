import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  createCastingFlow,
  BridgeService,
  Pages,
  selectOpenedWindow,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import {
  BibleActionSource,
  BibleActions,
  BibleActionsEnum,
} from './bible.actions';
import { BibleState } from './bible.store';
import { selectCastingProcess } from './bible.selectors';
import { map, tap } from 'rxjs';

@Injectable()
export class BibleForCastingEffects {
  private readonly store = inject<Store<BibleState>>(Store);
  private readonly bridge = inject(BridgeService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly window = inject(WindowService);
  private readonly actions$ = inject(Actions);

  private readonly base = createCastingFlow<BibleState>({
    actionSource: BibleActionSource,
    featureName: Pages.BIBLE_FEATURE,
    openCastingAction: BibleActions[BibleActionsEnum.openCasting],
    openPageAction: BibleActions[BibleActionsEnum.openPage],
    startCastingAction: BibleActions[BibleActionsEnum.startCasting],
    pauseCastingAction: BibleActions[BibleActionsEnum.pauseCasting],
    stopCastingAction: BibleActions[BibleActionsEnum.stopCasting],
    slideNavigateAction: BibleActions[BibleActionsEnum.castingProcessChange],
    selectCastingProcess,
    selectOpenedWindow,
    getDisplayForCasting: () => this.settingsSrv.getDisplayForCasting(),
    store: this.store,
    bridge: this.bridge,
    window: this.window,
    actions$: this.actions$,
  });

  openCasting$ = this.base.openCasting$;
  onOpenPage$ = this.base.onOpenPage$;
  onOpenedPage$ = this.base.onOpenedPage$;
  startCastingTrigger$ = this.base.startCastingTrigger$;
  pauseCasting$ = this.base.pauseCasting$;
  stopCasting$ = this.base.stopCasting$;
  slideNavigate$ = this.base.slideNavigate$;
  updateSecondaryTranslationSettings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.updateSecondaryTranslationSettings),
      tap((data) => {
        this.bridge.send(BibleActionsEnum.updateSecondaryTranslationSettings, data);
      }),
      map(() => ({ type: '[BibleForCastingEffects] secondary settings sent' }))
    )
  );
}
