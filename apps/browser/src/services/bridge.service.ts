import { inject, Injectable } from '@angular/core';
import { WindowService } from './window.service';
import { ElectronEvents } from '@lyri-cast/common-electron';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class BridgeService {
  windowSrv = inject(WindowService);
  private router = inject(Router);

  constructor() {
    this.initSubs();
  }

  initSubs() {
    this.windowSrv.electronContext.receive(ElectronEvents.OPEN_PAGE, (data) => {
      if(!data) {
        console.log('EMPTY DATA');
        return;
      }
      console.log('evemt', data);
      // if (data.event === ElectronEvents.OPEN_PAGE) {
        const payload = data.payload;
        this.router.navigate([payload.name]);
      // }
    });
  }
}
