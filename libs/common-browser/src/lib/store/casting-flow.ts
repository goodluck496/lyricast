import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concat, EMPTY, from, Observable, of } from 'rxjs';
import { filter, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import {
  APP_COMMON_ACTIONS,
  AppDisplay,
  AppWindowTypes,
} from '@lyri-cast/common-electron';
import { Action, ActionCreator, Store } from '@ngrx/store';
import { BridgeService, WindowService } from '../services';
import { AppActions } from './app.store';

export interface CastingFlowOptions<State> {
  /**
   * Название фичи в роутинге
   */
  featureName: string;
  /**
   * Открытие нового окна длдя кастинга
   */
  openCastingAction: ActionCreator;
  /**
   * Открытие страницы для кастинга определенной фичи
   */
  openPageAction: ActionCreator;
  /**
   * Запуск кастинга, передача необходимых для страницы кастинга данных
   */
  startCastingAction: ActionCreator;
  /**
   * Событие готовности окна кастинга
   */
  castingStartedAction: ActionCreator;
  /**
   * Остановка кастинга (пока скрытие содержимого, может сделать это опционально)
   */
  pauseCastingAction: ActionCreator;
  /**
   * Отключение кастинга, закрытие окна кастинга
   */
  stopCastingAction: ActionCreator;
  /**
   * Событие управления выбранным слайдом на строанице кастинга
   */
  slideNavigateAction: ActionCreator;

  selectCastingProcess: (state: State) => unknown;

  selectOpenedWindow: (state: State) => unknown;
  getDisplayForCasting: () => Observable<AppDisplay>;
  store: Store<State>;
  bridge: BridgeService;
  window: WindowService;
  actions$: Actions;

  actionSource: string;
}

function createBridgeEffect<A extends ActionCreator>({
  actions$,
  action,
  bridge,
  label,
  bridgeEventNameExtractorCb
}: {
  actions$: Actions;
  action: A;
  bridge: BridgeService;
  label: string;
  bridgeEventNameExtractorCb: (action: string) => string
}) {
  return createEffect(() =>
    actions$.pipe(
      ofType(action),
      tap((data) => {
        //todo узкое место, если евенты не доходят до кона кастинга,
        // тогда скорее всего неверно задан source в createActionGroup
        const eventName = bridgeEventNameExtractorCb(action.type);
        bridge.send(eventName, data)
      }),
      map(() => ({ type: `[CastingFlow] ${label} sent` }))
    )
  );
}

function createOpenCastingEffect<State>({
  actions$,
  openCastingAction,
  openPageAction,
  selectOpenedWindow,
  getDisplayForCasting,
  window,
  bridge,
  store,
  featureName,
}: CastingFlowOptions<State>) {
  const castingPath = { path: [featureName, 'casting'] };

  return createEffect(() =>
    actions$.pipe(
      ofType(openCastingAction),
      withLatestFrom(store.select(selectOpenedWindow)),
      switchMap(([, windowData]) => {
        if (windowData) {
          return of(openPageAction(castingPath) as Action);
        }

        return getDisplayForCasting().pipe(
          switchMap((display) =>
            from(
              window.electronContext.openWindow({
                display,
                title: '',
                type: AppWindowTypes.CASTING,
              })
            ).pipe(
              tap((procId) => {
                store.dispatch(
                  AppActions.setProcId({
                    procId,
                    pageType: AppWindowTypes.CASTING,
                  })
                );
              }),
              switchMap(() => bridge.queueEvents),
              filter(
                (event) => !!event && event.event === APP_COMMON_ACTIONS.appInit
              ),
              map(() => openPageAction(castingPath) as Action)
            )
          )
        );
      })
    )
  );
}

export function createCastingFlow<State>(options: CastingFlowOptions<State>) {
  const {
    openPageAction,
    startCastingAction,
    castingStartedAction,
    pauseCastingAction,
    stopCastingAction,
    slideNavigateAction,
    bridge,
    actions$,
    actionSource,
    store,
    selectCastingProcess
  } = options;

  const openCasting$ = createOpenCastingEffect(options);

  const onOpenPage$ = createEffect(() =>
    actions$.pipe(
      ofType(openPageAction),
      tap((data) => {
        console.log('send open page', data);
        bridge.send(APP_COMMON_ACTIONS.openPage, data);
      }),
      map(() => ({ type: '[CastingFlow] openPage sent' }))
    )
  );

  // Добавляем эффект для обработки openedPage, как в прямой реализации
  const onOpenedPage$ = createEffect(() =>
    actions$.pipe(
      ofType(openPageAction),
      switchMap(() => bridge.queueEvents),
      withLatestFrom(store.select(selectCastingProcess)),
      filter(
        ([event]) => !!event && event.event === APP_COMMON_ACTIONS.openedPage
      ),
      map(([, data]) => {
        if (!data) {
          return pauseCastingAction() as Action;
        }
        return startCastingAction(data) as Action;
      })
    )
  );

  const extractEventName = (actionName: string) => {
    return actionName.replace(`[${actionSource}] `, '');
  }

  const startCastingTrigger$ = createBridgeEffect({
    actions$,
    action: startCastingAction,
    bridge,
    label: 'startCasting',
    bridgeEventNameExtractorCb: extractEventName
  });

  const pauseCasting$ = createBridgeEffect({
    actions$,
    action: pauseCastingAction,
    bridge,
    label: 'pauseCasting',
    bridgeEventNameExtractorCb: extractEventName
  });

  const stopCasting$ = createBridgeEffect({
    actions$,
    action: stopCastingAction,
    bridge,
    label: 'stopCasting',
    bridgeEventNameExtractorCb: extractEventName
  });

  const castingStarted$ = createBridgeEffect({
    actions$,
    action: castingStartedAction,
    bridge,
    label: 'castingStarted',
    bridgeEventNameExtractorCb: extractEventName
  });

  const slideNavigate$ = createBridgeEffect({
    actions$,
    action: slideNavigateAction,
    bridge,
    label: 'slideNavigate',
    bridgeEventNameExtractorCb: extractEventName
  });

  return {
    openCasting$,
    onOpenPage$,
    onOpenedPage$,
    startCastingTrigger$,
    pauseCasting$,
    stopCasting$,
    castingStarted$,
    slideNavigate$,
  };
}
