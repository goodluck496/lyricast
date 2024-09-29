import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
  shell,
} from 'electron';
import { rendererAppName, rendererAppPort } from './constants';
import { environment } from '../environments/environment';
import { join } from 'path';
import { AppWindowTypes } from '@lyri-cast/common-electron';
import {format} from 'url'

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

  private static onClose() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    App.openedWindows[AppWindowTypes.MAIN] = null;
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
      App.loadWindow();
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

    const createdWindow = App.createWindow(AppWindowTypes.MAIN, {
      width: width,
      height: height,
      show: false,

      webPreferences: {
        contextIsolation: true,
        nodeIntegration: true,
        backgroundThrottling: false,
        preload: join(__dirname, 'main.preload.js'),
      },
    });

    // Create the browser window.
    App.openedWindows = {
      [AppWindowTypes.MAIN]: createdWindow,
    };
    // App.mainWindow.setMenu(null);
    App.openedWindows[AppWindowTypes.MAIN].center();

    // if main window is ready to show, close the splash window and show the main window
    App.openedWindows[AppWindowTypes.MAIN].once('ready-to-show', () => {
      App.openedWindows[AppWindowTypes.MAIN].show();
    });

    // handle all external redirects in a new browser window
    // App.mainWindow.webContents.on('will-navigate', App.onRedirect);
    // App.mainWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
    //     App.onRedirect(event, url);
    // });
  }

  private static loadWindow(queryParams?: URLSearchParams) {
    // load the index.html of the app.
    if (!App.application.isPackaged) {
      App.openedWindows[AppWindowTypes.MAIN].loadURL(
        `http://localhost:${rendererAppPort}`
      );
    } else {
      // const pathname = join(__dirname, '..', rendererAppName, 'index.html');
      // const protocol = 'file:';
      // const urlObject = new URL(pathname, protocol);
      //
      // if (queryParams) {
      //   queryParams.forEach((p) =>
      //     urlObject.searchParams.append(p, queryParams.get(p))
      //   );
      // }
      //
      // // Получение полного URL
      // const fullUrl = urlObject.href;
      App.openedWindows[AppWindowTypes.MAIN].loadURL(
        // fullUrl
        format({
          pathname: join(__dirname, '..', rendererAppName, 'index.html'),
          protocol: 'file:',
          slashes: true,
        })
      );
    }
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
