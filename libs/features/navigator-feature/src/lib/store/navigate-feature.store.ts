import { HistoryItem, HistoryType } from '../services/history.types';
import {
  createActionGroup,
  createReducer,
  emptyProps,
  on,
  props,
} from '@ngrx/store';

export type NavigatorFeatureState = {
  history: HistoryItem[];
  selectedHistoryKey: string | null;
};

export const navigateFeatureState: NavigatorFeatureState = {
  history: [],
  selectedHistoryKey: null,
};

export const NavigatorActionsTypes = {
  push: 'push',
  clear: 'clear',
  select: 'select',
} as const;

export type NavigatorActionKeys = keyof typeof NavigatorActionsTypes;

export const NavigatorActions = createActionGroup({
  source: 'NAVIGATOR_ACTIONS',
  events: {
    [NavigatorActionsTypes.push]: props<{ data: HistoryItem }>(),
    [NavigatorActionsTypes.clear]: emptyProps(),
    [NavigatorActionsTypes.select]: props<{ key: string }>(),
  },
});

export const NavigatorReducer = createReducer(
  navigateFeatureState,
  on(NavigatorActions.push, (state: NavigatorFeatureState, { data }) => {
    // const foundItems = state.history.filter((el) => el.type === data.type);
    // if (foundItems.length) {
    //   const foundGroup = foundItems.find(
    //     (el) => el.payload.key === data.payload.key
    //   );
    //
    //   if (foundGroup && foundGroup.type === HistoryType.SELECT_LYRIC) {
    //   }
    // }

    return {
      ...state,
      history: [...state.history, data],
    };
  }),
  on(NavigatorActions.clear, (state) => ({
    ...state,
    history: [],
    selectedHistoryKey: null,
  })),
  on(NavigatorActions.select, (state, { key }) => ({
    ...state,
    selectedHistoryKey: key,
  }))
);
