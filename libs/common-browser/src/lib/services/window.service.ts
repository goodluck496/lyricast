import { Injectable } from '@angular/core';
import {
  AppWindowTypes,
  Context,
  OpenWindowArgs,
} from '@lyri-cast/common-electron';

export const DEFAULT_CASTING_PAGE_CONFIG: Partial<OpenWindowArgs> & {
  type: AppWindowTypes;
  title: string;
} = {
  type: AppWindowTypes.CASTING,
  title: 'Casting new',
  show: true,
  center: true,
  fullscreen: true,
  focusable: true,
};

@Injectable({ providedIn: 'platform' })
export class WindowService {
  get hasElectron(): boolean {
    return 'electron' in (window as Window);
  }

  get electronContext(): Context {
    return this.hasElectron
      ? ((window as any).electron as Context)
      : {
          send: () => void 0,
          receive: () => void 0,
          getAppVersion: () => Promise.resolve(''),
          getWindowType: () => Promise.resolve(AppWindowTypes.MAIN),
          closeWindow: () => Promise.resolve(void 0),
          openWindow: () => Promise.resolve(0),
          getDisplays: () => Promise.resolve([]),
          platform: '',
        };
  }
}
