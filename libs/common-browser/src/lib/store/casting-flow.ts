import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concat, EMPTY, from, Observable, of } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  pairwise,
  shareReplay,
  skip,
  startWith,
  switchMap,
  take,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import {
  APP_COMMON_ACTIONS,
  AppDisplay,
  AppWindowTypes,
} from '@lyri-cast/common-electron';
import { Action, ActionCreator, Store } from '@ngrx/store';
import { BridgeService, WindowService, SettingsService } from '../services';
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

  // Опциональный селектор текущей навигации, чтобы догнать casting после разморозки
  selectNavigateState?: (state: State) => unknown;

  selectCastingProcess: (state: State) => unknown;

  selectOpenedWindow: (state: State) => unknown;
  getDisplayForCasting: () => Observable<AppDisplay>;
  store: Store<State>;
  bridge: BridgeService;
  window: WindowService;
  settingsSrv?: SettingsService;
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
  selectCastingFrozen,
  getDisplayForCasting,
  window,
  bridge,
  store,
  featureName,
  settingsSrv,
}: CastingFlowOptions<State>) {
  const castingPath = { path: [featureName, 'casting'] };
  const castingFrozen$ = selectCastingFrozen
    ? store.select(selectCastingFrozen as never).pipe(
        map((value: unknown) => !!value),
        distinctUntilChanged()
      )
    : of(false);

  return createEffect(() =>
    actions$.pipe(
      ofType(openCastingAction),
      withLatestFrom(store.select(selectOpenedWindow), castingFrozen$),
      switchMap(([, windowData, frozen]) => {
        if (windowData) {
          if (frozen) {
            return EMPTY;
          }

          return of(openPageAction(castingPath) as Action);
        }

        const activeChannels = settingsSrv?.getActiveChannels() || [];
        const allChannels = settingsSrv?.getChannels() || [];
        // Auto-start any enabled NDI channels
        for (const ch of activeChannels) {
          if (ch.enabled && ch.targetType === 'ndi') {
            settingsSrv?.startNdiChannel(ch);
          }
        }

        const mainChannel = allChannels.find((c) => c.id === 'main');
        const shouldOpenMainPhysicalWindow = mainChannel
          ? mainChannel.enabled && (mainChannel.targetType === 'display' || mainChannel.targetType === 'emulated')
          : true;

        if (!shouldOpenMainPhysicalWindow) {
          store.dispatch(
            AppActions.setProcId({
              procId: -1,
              pageType: AppWindowTypes.CASTING,
            })
          );
          return of(openPageAction(castingPath) as Action);
        }

        return getDisplayForCasting().pipe(
          switchMap((display) =>
            from(
              window.electronContext.openWindow({
                display,
                title: 'Main Casting',
                channelId: 'main',
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
    selectNavigateState,
  } = options;

  const castingFrozen$ = selectCastingFrozen
    ? store.select(selectCastingFrozen as any).pipe(
        startWith(false),
        map((value: unknown) => !!value),
        distinctUntilChanged()
      )
    : of(false);

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

  // Обработка openedPage для всех окон кастинга (мульти-монитор, NDI, плавающие окна)
  const onOpenedPage$ = createEffect(() =>
    bridge.queueEvents.pipe(
      filter((event) => {
        if (!event || event.event !== APP_COMMON_ACTIONS.openedPage) {
          return false;
        }

        const payload =
          typeof event.payload === 'object' && event.payload !== null
            ? (event.payload as Record<string, unknown>)
            : null;

        return (
          payload?.['state'] === 'after-view-init' ||
          (payload?.['state'] === 'navigation-ended' &&
            payload?.['result'] === false)
        );
      }),
      withLatestFrom(
        store.select(selectCastingProcess),
        selectGlobalTransition ? store.select(selectGlobalTransition as any) : of(null),
        selectSlideTransitions ? store.select(selectSlideTransitions as any) : of(null)
      ),
      filter(([_, data]) => !!data),
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
    blocked$: castingFrozen$
  });

  const pauseCasting$ = createBridgeEffect({
    actions$,
    action: pauseCastingAction,
    bridge,
    label: 'pauseCasting',
    bridgeEventNameExtractorCb: extractEventName,
    blocked$: castingFrozen$
  });

  const stopCasting$ = createEffect(() =>
    actions$.pipe(
      ofType(stopCastingAction),
      withLatestFrom(
        castingFrozen$
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
        blocked$: castingFrozen$
      })
    : (undefined as unknown as ReturnType<typeof createEffect>);

  const slideNavigate$ = createBridgeEffect({
    actions$,
    action: slideNavigateAction,
    bridge,
    label: 'slideNavigate',
    bridgeEventNameExtractorCb: extractEventName,
    blocked$: castingFrozen$
  });

  const liveUpdateSlide$ = liveUpdateSlideAction
    ? createBridgeEffect({
        actions$,
        action: liveUpdateSlideAction,
        bridge,
        label: 'liveUpdateSlide',
        bridgeEventNameExtractorCb: extractEventName,
        blocked$: castingFrozen$
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
          castingFrozen$
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

  const syncOnUnfreeze$ = selectCastingFrozen
    ? createEffect(() =>
        castingFrozen$.pipe(
          pairwise(),
          filter(([previousFrozen, frozen]) => previousFrozen && !frozen),
          withLatestFrom(
            store.select(selectCastingProcess),
            store.select(options.selectOpenedWindow)
          ),
          filter(([, process, openedWindow]) => !!process && !!openedWindow),
          map(() => openPageAction({ path: [options.featureName, 'casting'] }) as Action)
        )
      )
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
    ...(selectCastingFrozen ? { syncOnUnfreeze$ } : {}),
    // опциональные эффекты возвращаем, если были заданы
    ...(setGlobalTransitionAction ? { setGlobalTransition$ } : {}),
    ...(setSlideTransitionAction ? { setSlideTransition$ } : {}),
    ...(updateTransitionSettingsAction ? { updateTransitionSettings$ } : {}),
  };
}
