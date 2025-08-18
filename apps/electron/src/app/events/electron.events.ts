/**
 * This module is responsible on handling all the inter process communications
 * between the frontend to the electron backend.
 */

import { app, ipcMain, screen } from 'electron';
import { environment } from '../../environments/environment';
import {
  ElectronActionEvents,
  ElectronAppEvents,
  ElectronCommonEvents,
} from './events.types';
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
    console.log(`OpenWindow event: `,event, args);
    if (App.openedWindows[args.type]) {
      return;
    }

    /**
     * todo можно оформить в отдельную функцию=
     */
    if (args.type === AppWindowTypes.CASTING) {
      const { x, y } = args.display.bounds;
      App.createWindow(args.type, {
        webPreferences: {
          ...DEFAULT_WEB_PREF,
        },
        x,
        y,
        fullscreenable: true,
        fullscreen: true,
        alwaysOnTop: true,
        // focusable: false,
        ...args,
      });
      App.loadWindow(args.type);
      // App.openedWindows[args.type].menuBarVisible = true;
      App.openedWindows[args.type].menuBarVisible = false;

      return App.openedWindows[args.type].webContents.getProcessId();
    }
  }
);

ipcMain.handle(
  ElectronActionEvents.CLOSE_WINDOW,
  (event, args: CloseWindowArgs) => {
    console.log('close ', event, args);
    if (!App.openedWindows[args.type]) {
      return;
    }
    if (args.type === AppWindowTypes.MAIN) {
      Array.from(Object.entries(App.openedWindows))
        .filter(([key, browserWindow]) => key !== AppWindowTypes.MAIN)
        .forEach(([key, browserWindow]) => {
          App.onClose(key as AppWindowTypes);

          if (!browserWindow.isDestroyed()) {
            browserWindow.destroy();
          }
        });
    } else {
      App.onClose(args.type);
    }
  }
);

// Handle App termination
ipcMain.on('quit', (event, code) => {
  app.exit(code);
});

ipcMain.handle(ElectronActionEvents.GET_WINDOW_TYPE, (event) => {
  return App.openedWindowTypesByProcess[event.processId];
});

ipcMain.handle(ElectronCommonEvents.SEND, (event, payload) => {
  Object.keys(App.openedWindows).forEach((key) => {
    const targetWindow = App.openedWindows[key];
    if (!targetWindow) {
      console.log('!targetWindow');
      return;
    }
    if (targetWindow.webContents.id === event.sender.id) {
      console.log(
        '[CONTINUE] targetWindow.webContents.id === event.sender.id'
        // JSON.stringify(payload)
      );
      return; // Пропускаем, если это отправляющее окно
    }
    App.openedWindows[key].webContents.send(
      ElectronCommonEvents.RECEIVE,
      payload
    );
  });
});

ipcMain.handle(ElectronAppEvents.GET_DISPLAYS, () => {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;

  return displays.map((el) => {
    return {
      ...el,
      primary: el.id === primaryId,
    };
  });
});
