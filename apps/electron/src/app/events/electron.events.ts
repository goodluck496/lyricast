/**
 * This module is responsible on handling all the inter process communications
 * between the frontend to the electron backend.
 */

import { app, ipcMain } from 'electron';
import { environment } from '../../environments/environment';
import { ElectronActionEvents } from './events.types';
import {
  AppWindowTypes,
  CloseWindowArgs,
  OpenWindowArgs,
} from '@lyri-cast/common-electron';
import App, { DEFAULT_WEB_PREF } from '../app';

export default class ElectronEvents {
  static bootstrapElectronEvents(): Electron.IpcMain {
    return ipcMain;
  }
}

// Retrieve app version
ipcMain.handle(ElectronActionEvents.GET_APP_VERSION, () => {
  console.log(`Fetching application version... [v${environment.version}]`);

  return environment.version;
});

ipcMain.handle(
  ElectronActionEvents.OPEN_WINDOW,
  (event, args: OpenWindowArgs) => {
    if (App.openedWindows[args.type]) {
      return;
    }

    /**
     * todo можно оформить в отдельную функцию
     */
    if (args.type === AppWindowTypes.SONG_CASTING) {
      App.createWindow(args.type, {
        webPreferences: {
          ...DEFAULT_WEB_PREF,
        },
        ...args,
      });
      App.loadWindow(
        args.type
      );

      return App.openedWindows[args.type].webContents.getProcessId();
    }
  }
);

ipcMain.handle(
  ElectronActionEvents.CLOSE_WINDOW,
  (event, args: CloseWindowArgs) => {
    if (!App.openedWindows[args.type]) {
      return;
    }
    App.onClose(args.type);
  }
);

// Handle App termination
ipcMain.on('quit', (event, code) => {
  app.exit(code);
});

ipcMain.handle(ElectronActionEvents.GET_WINDOW_TYPE, (event) => {
  return App.openedWindowTypesByProcess[event.processId];
})
