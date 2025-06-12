import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Pages } from '@lyri-cast/common-browser';
import { FreeSlide } from '@lyri-cast/entities';

export const FreeSlideActionsEnum = {
  openPage: 'openPage',
  openedPage: 'openedPage',
  openCasting: 'openCasting',
  startCasting: 'startCasting',
  castingStarted: 'castingStarted',
  stopCasting: 'stopCasting',
  pauseCasting: 'pauseCasting',
  slideNavigate: 'slideNavigate',
} as const;

export type FreeSlideActionsEnumKeys = keyof typeof FreeSlideActionsEnum;

export type FreeSlideStartCastingPayload = {
  slideId: string;
  slides: FreeSlide[];
  fromIndex: number;
};

export type FreeSlideNavigatePayload = {
  slide: FreeSlide;
  direction?: 'next' | 'prev';
  index?: number;
};

export const FreeSlideActionSource = 'FREESLIDE_ACTIONS'

export const FreeSlideActions = createActionGroup({
  source: FreeSlideActionSource,
  events: {
    [FreeSlideActionsEnum.openPage]: props<{ path: Pages[] }>(),
    [FreeSlideActionsEnum.openedPage]: props<{ name: Pages }>(),
    [FreeSlideActionsEnum.openCasting]: props<FreeSlideStartCastingPayload>(),
    [FreeSlideActionsEnum.startCasting]: props<FreeSlideStartCastingPayload>(),
    [FreeSlideActionsEnum.stopCasting]: emptyProps(),
    [FreeSlideActionsEnum.pauseCasting]: emptyProps(),
    [FreeSlideActionsEnum.castingStarted]: emptyProps(),
    [FreeSlideActionsEnum.slideNavigate]: props<FreeSlideNavigatePayload>(),
  },
});
