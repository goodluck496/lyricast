import { Injectable } from '@angular/core';
import { Context, ElectronEvents } from '@lyri-cast/common-electron';

@Injectable({ providedIn: 'platform' })
export class WindowService {
  get electronContext(): Context {
    return (window as any).electron as Context;
  }

  constructor() {
    this.electronContext.send({
      event: ElectronEvents.INIT_NEW_WINDOW,
      payload: undefined,
    });
  }
}
