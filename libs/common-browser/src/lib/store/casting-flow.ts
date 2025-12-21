import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concat, EMPTY, from, Observable, of } from 'rxjs';
import { filter, map, switchMap, tap, withLatestFrom, startWith, shareReplay } from 'rxjs/operators';
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
  castingStartedAction?: ActionCreator;
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

  liveUpdateSlideAction?: ActionCreator;

  // Дополнительные действия (опционально) для централизованного проброса через Bridge
  setGlobalTransitionAction?: ActionCreator;
  setSlideTransitionAction?: ActionCreator;
  updateTransitionSettingsAction?: ActionCreator;

  // Опциональные селекторы для начальной синхронизации переходов
  selectGlobalTransition?: (state: State) => unknown;
  selectSlideTransitions?: (state: State) => unknown;

  // Опциональный селектор для блокировки проброса событий, когда включена "заморозка" (freeze)
  selectCastingFrozen?: (state: State) => unknown;

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
  bridgeEventNameExtractorCb,
  blocked$
}: {
  actions$: Actions;
  action: A;
  bridge: BridgeService;
  label: string;
  bridgeEventNameExtractorCb: (action: string) => string;
  blocked$?: Observable<boolean>;
}) {
  return createEffect(() =>
    actions$.pipe(
      ofType(action),
      withLatestFrom(blocked$ ?? of(false)),
      filter(([, blocked]) => !blocked),
      tap(([data]) => {
        //todo узкое место, если евенты не доходят до кона кастинга,
        // тогда скорее всего неверно задан source в createActionGroup
        const eventName = bridgeEventNameExtractorCb(action.type);
        bridge.send(eventName, data as any)
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
    selectCastingProcess,
    liveUpdateSlideAction,
    setGlobalTransitionAction,
    setSlideTransitionAction,
    updateTransitionSettingsAction,
    selectGlobalTransition,
    selectSlideTransitions,
    selectCastingFrozen,
  } = options;

  const openCasting$ = createOpenCastingEffect(options);

  const onOpenPage$ = createEffect(() =>
    actions$.pipe(
      ofType(openPageAction),
      tap((data) => {
        bridge.send(APP_COMMON_ACTIONS.openPage, data);
      }),
      map(() => ({ type: '[CastingFlow] openPage sent' }))
    )
  );

  // Добавляем эффект для обработки openedPage, как в прямой реализации
  const onOpenedPage$ = createEffect(() =>
    actions$.pipe(
      ofType(openPageAction),
      switchMap(() => bridge.queueEvents.pipe(
        filter((event) => !!event && event.event === APP_COMMON_ACTIONS.openedPage)
      )),
      withLatestFrom(
        store.select(selectCastingProcess),
        selectGlobalTransition ? store.select(selectGlobalTransition as any) : of(null),
        selectSlideTransitions ? store.select(selectSlideTransitions as any) : of(null)
      ),
      tap(([_, __, globalTransition, slideTransitions]) => {
        if (setGlobalTransitionAction && globalTransition) {
          const eventName = extractEventName(setGlobalTransitionAction.type);
          bridge.send(eventName, { transition: globalTransition } as any);
        }
        if (setSlideTransitionAction && slideTransitions) {
          const entries: [string, any][] = slideTransitions instanceof Map
            ? Array.from(slideTransitions.entries())
            : Object.entries(slideTransitions as Record<string, any>);
        	for (const [slideId, transition] of entries) {
            const eventName = extractEventName(setSlideTransitionAction.type);
            bridge.send(eventName, { slideId, transition } as any);
          }
        }
      }),
      map(([_, data]) => {
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

  // Состояние готовности окна кастинга
  const startCastingTrigger$ = createBridgeEffect({
    actions$,
    action: startCastingAction,
    bridge,
    label: 'startCasting',
    bridgeEventNameExtractorCb: extractEventName,
    blocked$: selectCastingFrozen ? store.select(selectCastingFrozen as any).pipe(startWith(false), map((v: any) => !!v)) : of(false)
  });

  const pauseCasting$ = createBridgeEffect({
    actions$,
    action: pauseCastingAction,
    bridge,
    label: 'pauseCasting',
    bridgeEventNameExtractorCb: extractEventName,
    blocked$: selectCastingFrozen ? store.select(selectCastingFrozen as any).pipe(startWith(false), map((v: any) => !!v)) : of(false)
  });

  const stopCasting$ = createEffect(() =>
    actions$.pipe(
      ofType(stopCastingAction),
      withLatestFrom(
        selectCastingFrozen
          ? store
              .select(selectCastingFrozen as any)
              .pipe(startWith(false), map((v: any) => !!v))
          : of(false)
      ),
      filter(([, frozen]) => !frozen),
      tap(([data]) => {
        const eventName = extractEventName(stopCastingAction.type);
        bridge.send(eventName, data as any);
      }),
      map(() => ({ type: '[CastingFlow] stopCasting sent' }))
    )
  );

  const castingStarted$ = castingStartedAction
    ? createBridgeEffect({
        actions$,
        action: castingStartedAction,
        bridge,
        label: 'castingStarted',
        bridgeEventNameExtractorCb: extractEventName,
        blocked$: selectCastingFrozen ? store.select(selectCastingFrozen as any).pipe(startWith(false), map((v: any) => !!v)) : of(false)
      })
    : (undefined as unknown as ReturnType<typeof createEffect>);

  const slideNavigate$ = createBridgeEffect({
    actions$,
    action: slideNavigateAction,
    bridge,
    label: 'slideNavigate',
    bridgeEventNameExtractorCb: extractEventName,
    blocked$: selectCastingFrozen ? store.select(selectCastingFrozen as any).pipe(startWith(false), map((v: any) => !!v)) : of(false)
  });

  const liveUpdateSlide$ = liveUpdateSlideAction
    ? createBridgeEffect({
        actions$,
        action: liveUpdateSlideAction,
        bridge,
        label: 'liveUpdateSlide',
        bridgeEventNameExtractorCb: extractEventName,
        blocked$: selectCastingFrozen ? store.select(selectCastingFrozen as any).pipe(startWith(false), map((v: any) => !!v)) : of(false)
      })
    : (undefined as unknown as ReturnType<typeof createEffect>);

  const castingReady$ = options.bridge.queueEvents.pipe(
    filter((event) => !!event && event.event === 'castingStarted'),
    map(() => true),
    startWith(false),
    shareReplay(1)
  );

  const forwardWhenReady = <A extends ActionCreator>(cfg: {
    action: A;
    label: string;
  }) =>
    createEffect(() =>
      actions$.pipe(
        ofType(cfg.action),
        withLatestFrom(
          castingReady$,
          selectCastingFrozen ? store.select(selectCastingFrozen as any).pipe(startWith(false), map((v: any) => !!v)) : of(false)
        ),
        filter(([, ready, frozen]) => !!ready && !frozen),
        tap(([data]) => {
          const eventName = extractEventName(cfg.action.type);
          bridge.send(eventName, data as any);
        }),
        map(() => ({ type: `[CastingFlow] ${cfg.label} sent` }))
      )
    );

  const setGlobalTransition$ = setGlobalTransitionAction
    ? forwardWhenReady({ action: setGlobalTransitionAction, label: 'setGlobalTransition' })
    : (undefined as unknown as ReturnType<typeof createEffect>);

  const setSlideTransition$ = setSlideTransitionAction
    ? forwardWhenReady({ action: setSlideTransitionAction, label: 'setSlideTransition' })
    : (undefined as unknown as ReturnType<typeof createEffect>);

  const updateTransitionSettings$ = updateTransitionSettingsAction
    ? forwardWhenReady({ action: updateTransitionSettingsAction, label: 'updateTransitionSettings' })
    : (undefined as unknown as ReturnType<typeof createEffect>);

  

  return {
    openCasting$,
    onOpenPage$,
    onOpenedPage$,
    startCastingTrigger$,
    pauseCasting$,
    stopCasting$,
    ...(castingStartedAction ? { castingStarted$ } : {}),
    slideNavigate$,
    ...(liveUpdateSlideAction ? { liveUpdateSlide$ } : {}),
    // опциональные эффекты возвращаем, если были заданы
    ...(setGlobalTransitionAction ? { setGlobalTransition$ } : {}),
    ...(setSlideTransitionAction ? { setSlideTransition$ } : {}),
    ...(updateTransitionSettingsAction ? { updateTransitionSettings$ } : {}),
  };
}
