import { inject, Injectable } from '@angular/core';
import { WindowService } from './common/window.service';
import {
  AppWindowTypes,
  ElectronEvents,
  EventData,
  EventPayloadItem,
} from '@lyri-cast/common-electron';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';

@Injectable({ providedIn: 'root' })
export class BridgeService {
  windowSrv = inject(WindowService);
  private router = inject(Router);

  queueEvents = new BehaviorSubject<EventData<ElectronEvents> | null>(null);

  windowType: AppWindowTypes | null = null;

  constructor() {
    this.windowSrv.electronContext.getWindowType().then((v) => {
      this.windowType = v;
      console.log('window type - ', v);
    });
    this.initSubs();
  }

  initSubs() {
    this.queueEvents.pipe(filterEmpty()).subscribe(async (data) => {
      if (!this.windowType) {
        this.windowType = await this.windowSrv.electronContext.getWindowType();
      }

      if (
        this.windowType !== AppWindowTypes.MAIN &&
        data.event === ElectronEvents.OPEN_PAGE
      ) {
        const payload =
          data.payload as EventPayloadItem<ElectronEvents.OPEN_PAGE>;
        this.router.navigate([payload.name]);
      }
    });

    this.windowSrv.electronContext.receive2((event, data) => {
      this.queueEvents.next(data);
    });
  }
}
