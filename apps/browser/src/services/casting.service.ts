import { inject, Injectable } from '@angular/core';
import { WindowService } from './window.service';
import { AppWindowTypes, ElectronEvents } from '@lyri-cast/common-electron';
import { Pages } from '../app/pages/page.types';

@Injectable({ providedIn: 'root' })
export class CastingService {
  windowSrv = inject(WindowService);

  openedCastingWindowId: number | null = null;

  constructor() {
    this.initWindowsSubs();
  }


  openWindow() {
    if (this.openedCastingWindowId) {
      return;
    }

    this.windowSrv.electronContext
      .openWindow({
        type: AppWindowTypes.SONG_CASTING,
        title: 'Casting',
        show: true,
        opacity: 0.5,
        center: true,
        // fullscreen: true,
        focusable: true,
      })
      .then((procId) => {
        this.openedCastingWindowId = procId;

      });

  }

  initWindowsSubs() {
    this.windowSrv.electronContext.receive(
      ElectronEvents.INIT_NEW_WINDOW,
      () => {
        this.windowSrv.electronContext.send({
          event: ElectronEvents.OPEN_PAGE,
          payload: { name: Pages.CASTING },
        });
      }
    );
    this.windowSrv.electronContext.receive(ElectronEvents.CLOSE_WINDOW, (data) => {
      if(!data) {
        console.log('EMPTY DATA');
        return
      }

      if(this.openedCastingWindowId === data.payload.processId) {
        this.openedCastingWindowId = null;
        this.closeWindow();
      }

    });
  }

  closeWindow(): Promise<void> {
    return this.windowSrv.electronContext.closeWindow({
      type: AppWindowTypes.SONG_CASTING,
    });
  }
}
