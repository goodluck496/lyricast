import { BaseEffectsWithBridgeInterface } from '../interfaces/index';
import { Action, Store } from '@ngrx/store';
import { EventData } from '@lyri-cast/common-electron';
import { BridgeService } from '../services/index';
import { inject } from '@angular/core';

export function BridgeProcessForEffectsDecorator(
  map: Record<string, (eventData: EventData) => Action>
) {
  return function <
    T extends { new (...args: any[]): BaseEffectsWithBridgeInterface }
  >(constructor: T): T {
    return class extends constructor implements BaseEffectsWithBridgeInterface {
      override bridge = inject(BridgeService);
      override store = inject(Store);

      override actionMapper(eventData: EventData): Action | null {
        if (!(eventData.event in map)) {
          console.warn(
            `Not found action handler for event - '${eventData.event}'`
          );
          return null;
        }

        return map[eventData.event](eventData);
      }

      override initSubscribeByBridge(): void {
        this.bridge.queueEvents.subscribe((data) => {
          if (!data) {
            return;
          }
          const action = this.actionMapper(data);

          if (!action) {
            return;
          }
          this.store.dispatch(action);
        });
      }

      constructor(...args: any[]) {
        super(...args);
        this.initSubscribeByBridge();
      }
    };
  };
}
