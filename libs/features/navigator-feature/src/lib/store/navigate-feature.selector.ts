import { createFeature, createSelector } from '@ngrx/store';
import { HistoryItem } from '../services/history.types';
import { NavigatorReducer } from './navigate-feature.store';

export const NavigatorFeatureName = 'NavigatorFeatureName' as const ;

export const selectNavigatorFeature = createFeature({name: NavigatorFeatureName, reducer: NavigatorReducer })

export const {
  selectHistory
} = selectNavigatorFeature;

export const selectHistoryByType = (type: HistoryItem['type']) =>
  createSelector(selectHistory, (items) =>
    items.filter((item) => item.type === type)
  );
