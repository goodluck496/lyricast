import { BaseEffectsWithBridgeInterface } from '../interfaces/index';
import { Action, Store } from '@ngrx/store';
import { EventData } from '@lyri-cast/common-electron';
import { BridgeService } from '../services/index';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Декоратор принимает Record c названием actions которые нужно dispatch'ить в store
 * @param map
 * @param urlSegment необязательный сегмент URL текущей фичи для изоляции событий
 * @constructor
 */
export function BridgeProcessForEffectsDecorator(
  map: Record<string, (eventData: EventData) => Action>,
  urlSegment?: string
) {
  return function <
    T extends { new (...args: any[]): BaseEffectsWithBridgeInterface }
  >(constructor: T): T {
    return class extends constructor implements BaseEffectsWithBridgeInterface {
      override bridge = inject(BridgeService);
      override store = inject(Store);
      private router = inject(Router, { optional: true });

      override actionMapper(eventData: EventData): Action | null {
        if (!(eventData.event in map)) {
          return null;
        }

        return map[eventData.event](eventData);
      }

      override initSubscribeByBridge(): void {
        this.bridge.queueEvents.subscribe((data) => {
          if (!data) {
            return;
          }

          // Проверяем, что событие предназначено для текущего активного роута
          if (urlSegment && this.router && !this.router.url.includes(urlSegment)) {
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

