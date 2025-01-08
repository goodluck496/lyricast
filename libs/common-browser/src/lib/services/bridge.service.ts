import { inject, Injectable } from '@angular/core';
import { WindowService } from './window.service';
import { AppWindowTypes, EventData } from '@lyri-cast/common-electron';
import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';

@Injectable({ providedIn: 'root' })
export class BridgeService {
  windowSrv = inject(WindowService);
  store = inject(Store);

  queueEvents = new BehaviorSubject<EventData | null>(null);

  windowType: AppWindowTypes | null = null;

  constructor() {
    this.windowSrv.electronContext.getWindowType().then((v) => {
      this.windowType = v;
    });
    this.initSubs();
  }

  initSubs() {
    this.windowSrv.electronContext.receive((event, payload) => {
      return this.queueEvents.next(payload);
    });
  }

  send<Event extends string, PayloadMap extends Record<string, unknown>>(
    event: Event,
    payload: PayloadMap[Event]
  ): void {
    this.windowSrv.electronContext.send({ event, payload });
  }
}
