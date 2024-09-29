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
import App from '../app';

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
  ElectronActionEvents.OPEN_SECOND_WINDOW,
  (event, args: OpenWindowArgs) => {
    if (App.openedWindows[AppWindowTypes.SECOND]) {
      return;
    }

    const newWindow = App.createWindow(AppWindowTypes.SECOND, args);

    App.openedWindows[AppWindowTypes.SECOND] = newWindow;
  }
);

ipcMain.handle(
  ElectronActionEvents.CLOSE_SECOND_WINDOW,
  (event, args: CloseWindowArgs) => {
    console.log('close', event, args);
  }
);

// Handle App termination
ipcMain.on('quit', (event, code) => {
  app.exit(code);
});
