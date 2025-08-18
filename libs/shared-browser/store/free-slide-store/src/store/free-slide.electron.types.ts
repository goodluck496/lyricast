import { FreeSlideActionsEnum } from './free-slide.actions';

export type FreeSlideElectronPayload = {
  [FreeSlideActionsEnum.stopCasting]: void
  [FreeSlideActionsEnum.pauseCasting]: void
};
