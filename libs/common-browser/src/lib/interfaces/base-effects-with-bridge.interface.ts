import { BridgeService } from '../services/index';
import { EventData } from '@lyri-cast/common-electron';
import { Action, Store } from '@ngrx/store';

export interface BaseEffectsWithBridgeInterface {
  store: Store;
  bridge: BridgeService;

  initSubscribeByBridge?(): void;

  /**
   * Маппер IPC событий из electron на конкретные действия в NGRX
   * @param eventData
   */
  actionMapper?(eventData: EventData): Action | null;
}
