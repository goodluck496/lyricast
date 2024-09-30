import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  ipcMain,
  screen,
  shell,
} from 'electron';
import { rendererAppName, rendererAppPort } from './constants';
import { environment } from '../environments/environment';
import { join } from 'path';
import { AppWindowTypes, ElectronEvents } from '@lyri-cast/common-electron';
import * as process from 'node:process';

export const DEFAULT_WEB_PREF = {
  contextIsolation: true,
  nodeIntegration: true,
  backgroundThrottling: false,
  preload: join(__dirname, 'main.preload.js'),
};

export default class App {
  // Keep a global reference of the window object, if you don't, the window will
  // be closed automatically when the JavaScript object is garbage collected.

  static application: Electron.App;
  static BrowserWindow: typeof BrowserWindow;

  static openedWindows: Partial<
    Record<AppWindowTypes, Electron.BrowserWindow>
  > = {};

  public static isDevelopmentMode() {
    const isEnvironmentSet: boolean = 'ELECTRON_IS_DEV' in process.env;
    const getFromEnvironment: boolean =
      parseInt(process.env.ELECTRON_IS_DEV, 10) === 1;

    return isEnvironmentSet ? getFromEnvironment : !environment.production;
  }

  private static onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      App.application.quit();
    }
  }

  public static onClose(type: AppWindowTypes) {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.

    App.openedWindows[type].close();
    App.openedWindows[type] = null;
  }

  private static onRedirect(event: any, url: string) {
    if (url !== App.openedWindows[AppWindowTypes.MAIN].webContents.getURL()) {
      // this is a normal external redirect, open it in a new browser window
      event.preventDefault();
      shell.openExternal(url);
    }
  }

  private static onReady() {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    if (rendererAppName) {
      App.initMainWindow();
      App.loadWindow(AppWindowTypes.MAIN);
    }
  }

  private static onActivate() {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (App.openedWindows[AppWindowTypes.MAIN] === null) {
      App.onReady();
    }
  }

  public static createWindow(
    type: AppWindowTypes,
    options: BrowserWindowConstructorOptions
  ): BrowserWindow {
    const win = new BrowserWindow(options);
    const processId = win.webContents.getProcessId();
    App.openedWindows[type] = win;

    win.on('close', () => {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.

      if(type !== AppWindowTypes.MAIN) {
        App.openedWindows[AppWindowTypes.MAIN].webContents.send('receive',
          JSON.stringify({
            event: ElectronEvents.CLOSE_WINDOW,
            payload: { processId },
          }));
      }
    });


    win.on('closed', () => {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.

      App.openedWindows[type] = null;
    });

    return win;
  }

  private static initMainWindow() {
    const workAreaSize = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(1280, workAreaSize.width || 1280);
    const height = Math.min(720, workAreaSize.height || 720);

    const windowType = AppWindowTypes.MAIN;
    App.createWindow(windowType, {
      width: width,
      height: height,
      show: false,

      webPreferences: {
        ...DEFAULT_WEB_PREF,
      },
    });

    // App.mainWindow.setMenu(null);
    App.openedWindows[windowType].center();

    // if main window is ready to show, close the splash window and show the main window
    App.openedWindows[windowType].once('ready-to-show', () => {
      App.openedWindows[windowType].show();
    });

    ipcMain.on(`send`, (event, payload) => {
      Object.keys(App.openedWindows).forEach((key) => {
        const targetWindow = App.openedWindows[key];
        if (!targetWindow) {
          return;
        }
        if (targetWindow.webContents.id === event.sender.id) {
          return; // Пропускаем, если это отправляющее окн
        }
        App.openedWindows[key].webContents.send('receive', payload);
      });
    });

    // handle all external redirects in a new browser window
    // App.mainWindow.webContents.on('will-navigate', App.onRedirect);
    // App.mainWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
    //     App.onRedirect(event, url);
    // });
  }

  public static loadWindow(windowType: AppWindowTypes) {
    // load the index.html of the app.
    let urlObject: URL | null = null;

    if (!App.application.isPackaged) {
      urlObject = new URL(`http://localhost:${rendererAppPort}`);
    } else {
      urlObject = new URL(
        join(__dirname, '..', rendererAppName, 'index.html'),
        'file:'
      );
    }

    App.openedWindows[windowType].loadURL(urlObject.href);
  }

  static main(app: Electron.App, browserWindow: typeof BrowserWindow) {
    // we pass the Electron.App object and the
    // Electron.BrowserWindow into this function
    // so this class has no dependencies. This
    // makes the code easier to write tests for

    App.BrowserWindow = browserWindow;
    App.application = app;

    App.application.on('window-all-closed', App.onWindowAllClosed); // Quit when all windows are closed.
    App.application.on('ready', App.onReady); // App is ready to load data
    App.application.on('activate', App.onActivate); // App is activated
  }
}
