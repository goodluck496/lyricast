import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Pages } from '@lyri-cast/common-browser';
import { Slide } from '@lyri-cast/entities';

export const FreeSlideActionsEnum = {
  openPage: '[FREE_SLIDE]openPage',
  openedPage: '[FREE_SLIDE]openedPage',
  openCasting: '[FREE_SLIDE]openCasting',
  startCasting: '[FREE_SLIDE]startCasting',
  castingStarted: '[FREE_SLIDE]castingStarted',
  stopCasting: '[FREE_SLIDE]stopCasting',
  pauseCasting: '[FREE_SLIDE]pauseCasting',
  slideNavigate: '[FREE_SLIDE]slideNavigate',
  selectSlide: '[FREE_SLIDE]selectSlide',
  liveUpdateSlide: '[FREE_SLIDE]liveUpdateSlide',
} as const;

export type FreeSlideActionsEnumKeys = keyof typeof FreeSlideActionsEnum;

export type FreeSlideStartCastingPayload = {
  slideId: string;
  slides: Slide[];
  fromIndex: number;
};

export type FreeSlideNavigatePayload = {
  slide: Slide;
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
    [FreeSlideActionsEnum.selectSlide]: props<Slide>(),
    [FreeSlideActionsEnum.liveUpdateSlide]: props<{ slide: Slide }>(),
  },
});
