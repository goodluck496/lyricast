import {
  createActionGroup,
  createFeature,
  createReducer,
  emptyProps,
  on,
  props,
} from '@ngrx/store';
import { Pages } from '../pages.types';
import { ActionCreatorProps, Creator } from '@ngrx/store/src/models';
import {
  APP_COMMON_ACTIONS,
  AppCommonActionKeys,
  AppWindowTypes, OpenWindowArgs,
} from '@lyri-cast/common-electron';

export interface AppState {
  appInit: boolean;
  // openedWindow: AppWindowTypes | null;
  openedWindow: ActionOpenedWindow | null;
  openedPagePath: Pages[];
}

export const initialState: AppState = {
  appInit: false,
  openedWindow: null,
  openedPagePath: [],
};

export type ActionOpenedWindow = { procId: number; type: AppWindowTypes };
export type ActionOpenPageProps = { path: Pages[], windowProps?: OpenWindowArgs };
export type ActionCloseWindowProps = {
  windowType: AppWindowTypes;
};

export type AppCommonActionsPayload = {
  [APP_COMMON_ACTIONS.appInit]: void;
  [APP_COMMON_ACTIONS.setProcId]: number;
  [APP_COMMON_ACTIONS.openPage]: ActionOpenPageProps;
  [APP_COMMON_ACTIONS.closeWindow]: ActionCloseWindowProps;
};

export const AppActions = createActionGroup({
  source: 'APP_ACTIONS',
  events: {
    appInit: emptyProps(),
    setProcId: props<{ procId: number, pageType: AppWindowTypes }>(),
    clearWindowId: emptyProps(),
    openPage: props<ActionOpenPageProps>(),
    openedPage: props<ActionOpenPageProps>(),
    closeWindow: props<ActionCloseWindowProps>(),
  } satisfies Record<
    AppCommonActionKeys,
    ActionCreatorProps<unknown> | Creator
  >,
});

export const AppReducer = createReducer(
  initialState,
  on(AppActions.appInit, (state) => ({
    ...state,
    appInit: true,
  })),
  on(AppActions.setProcId, (state, data) => {
    console.log(state, data);
    return ({
      ...state,
      openedWindow: {
        ...state.openedWindow,
        procId: data.procId,
        type: data.pageType
      },
    })
  }),
  on(AppActions.openPage, (state) => ({
    ...state,
    openedPagePath: state.openedPagePath,
  })),
  on(AppActions.closeWindow, (state) => ({
    ...state,
    openedWindow: null,
  })),
  on(AppActions.clearWindowId, (state) => ({
    ...state,
    openedWindow: null,
  }))
);

export const appStateSelector = createFeature({
  name: 'ApplicationFeature',
  reducer: AppReducer,
});

export const {
  selectApplicationFeatureState,
  selectAppInit,
  selectOpenedPagePath,
  selectOpenedWindow,
} = appStateSelector;
