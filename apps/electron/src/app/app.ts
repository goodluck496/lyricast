import { app, BrowserWindow, BrowserWindowConstructorOptions, screen, shell } from 'electron';
import { rendererAppName, rendererAppPort } from './constants';
import { environment } from '../environments/environment';
import { join } from 'path';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import * as process from 'node:process';
import { ElectronAppEvents, ElectronCommonEvents } from './events/events.types';
import { debounceTime, distinctUntilChanged, fromEvent, Subscription } from 'rxjs';
import { WorkersRegistry } from '@lyri-cast/worker-kit';
import { registerSvcProtocol } from './api/svc.protocol';

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
  static workers: WorkersRegistry;

  static openedWindows: Partial<
    Record<AppWindowTypes, Electron.BrowserWindow>
  > = {};

  static openedWindowTypesByProcess: Record<number, AppWindowTypes> = {};

  public static isDevelopmentMode() {
    const isEnvironmentSet: boolean = 'ELECTRON_IS_DEV' in process.env;
    const getFromEnvironment: boolean =
      parseInt(process.env.ELECTRON_IS_DEV, 10) === 1;

    return isEnvironmentSet ? getFromEnvironment : !environment.production;
  }

  public static onClose(type: AppWindowTypes) {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    const openedWin = App.openedWindows[type];

    if (openedWin) {
      if (openedWin.isDestroyed()) {
        return;
      }
      openedWin.destroy();
    }

    App.openedWindows[type] = null;
  }

  public static createWindow(
    type: AppWindowTypes,
    options: BrowserWindowConstructorOptions
  ): BrowserWindow {
    //
    const win = new BrowserWindow(options);
    const processId = win.webContents.getProcessId();
    App.openedWindows[type] = win;
    App.openedWindowTypesByProcess[processId] = type;

    const subs: Subscription[] = [];

    win.on(ElectronAppEvents.CLOSE, () => {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.

      if (type !== AppWindowTypes.MAIN) {
        App.openedWindows[AppWindowTypes.MAIN].webContents.send(
          ElectronCommonEvents.RECEIVE,
          JSON.stringify({
            event: APP_COMMON_ACTIONS.closeWindow,
            payload: { processId },
          })
        );
      } else {
        Array.from(Object.entries(App.openedWindows)).forEach(
          ([key, browserWindow]) => {
            App.onClose(key as AppWindowTypes);

            if (!browserWindow.isDestroyed() && browserWindow.destroy) {
              browserWindow.destroy();
            }
          }
        );
      }
    });

    win.on(ElectronAppEvents.CLOSED, () => {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.

      App.openedWindows[type] = null;
      subs.forEach((sub) => sub.unsubscribe());
    });

    subs.push(
      fromEvent(win, 'move')
        .pipe(debounceTime(200), distinctUntilChanged())
        .subscribe(() => {
          const winBounds = win.getBounds();
          const display = screen.getDisplayMatching(winBounds);
          console.log('Окно теперь на дисплее: ', display.id);
        })
    );

    return win;
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

    const openedWindow = App.openedWindows[windowType];
    openedWindow.loadURL(urlObject.href).then(() => {
      if (windowType === AppWindowTypes.MAIN && !environment.production) {
        App.BrowserWindow.getAllWindows()[0].webContents.openDevTools();
      }
    });

    openedWindow.once(ElectronAppEvents.READY_TO_SHOW, () => {
      if (windowType === AppWindowTypes.MAIN) {
        openedWindow.focus();
      } else {
        /**
         * КОСТЫЛЬ
         * почему-то только интервально вызывая App.openedWindows.MAIN.focus();
         * ГЛАВНОЕ окно все таки получает фокус после открытия ДОПОЛНИТЕЛЬНОГО окна
         */
        let inFocus = false;
        const int = setInterval(() => {
          if (inFocus) {
            return;
          }

          if (openedWindow.isDestroyed()) {
            return;
          }

          //удалить
          // openedWindow.setFullScreen(true);

          App.application.focus({ steal: true });
          //удалить
          // App.openedWindows.MAIN.show();
          App.openedWindows.MAIN.focus();

          if (!environment.production) {
            // открываем devTools для отладки
            // App.BrowserWindow.getAllWindows()[0].webContents.openDevTools();
          }

          if (App.openedWindows.MAIN.isFocused()) {
            inFocus = true;
            clearInterval(int);
          }
        }, 500);
        openedWindow.once(ElectronAppEvents.CLOSED, () => {
          clearInterval(int); // гарантированно отпишемся
        });
      }
    });
  }

  static main(app: Electron.App, browserWindow: typeof BrowserWindow) {
    // we pass the Electron.App object and the
    // Electron.BrowserWindow into this function
    // so this class has no dependencies. This
    // makes the code easier to write tests for

    App.BrowserWindow = browserWindow;
    App.application = app;

    App.application.on(
      ElectronAppEvents.WINDOW_ALL_CLOSED,
      App.onWindowAllClosed
    ); // Quit when all windows are closed.

    App.application.on(ElectronAppEvents.READY, App.onReady); // App is ready to load data
    App.application.on(ElectronAppEvents.ACTIVATE, App.onActivate); // App is activated
  }

  private static onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      App.application.quit();
    }
  }

  private static onRedirect(event: any, url: string) {
    if (url !== App.openedWindows[AppWindowTypes.MAIN].webContents.getURL()) {
      // this is a normal external redirect, open it in a new browser window
      event.preventDefault();
      shell.openExternal(url);
    }
  }

  private static async onReady() {
    const isDev = !app.isPackaged;

    App.workers = new WorkersRegistry([
      {
        name: 'songs',
        rootApiPath: 'songs',
        distSubdir: 'songs-service',
        devWatch: isDev,
      },
      {
        name: 'bible',
        rootApiPath: 'bible',
        distSubdir: 'bible-service',
        devWatch: isDev,
      },
      {
        name: 'free-slide',
        rootApiPath: 'free-slide',
        distSubdir: 'free-slide-service',
        devWatch: isDev,
      },
    ]);
    registerSvcProtocol(App.workers);

    await App.workers.waitAllReady();
    console.log('workers are ready!!!');

    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    if (rendererAppName) {
      App.initMainWindow();
      App.loadWindow(AppWindowTypes.MAIN);
    }

    // (опционально) лог/метрики
    App.workers.on('worker:ready', (e) => console.log('[ready]', e));
    App.workers.on('worker:reready', (e) => console.log('[reready]', e));
    App.workers.on('worker:exit', (e) => console.warn('[exit]', e));
    App.workers.on('worker:error', (e) => console.error('[error]', e));
  }

  private static onActivate() {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (App.openedWindows[AppWindowTypes.MAIN] === null) {
      App.onReady();
    }
  }

  private static initMainWindow() {
    const workAreaSize = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.max(1280, workAreaSize.width || 1280);
    const height = Math.max(720, workAreaSize.height || 720);

    const windowType = AppWindowTypes.MAIN;
    App.createWindow(windowType, {
      width: width,
      height: height,
      show: false,
      fullscreen: false,
      backgroundMaterial: 'none',
      backgroundColor: '#000',
      webPreferences: {
        ...DEFAULT_WEB_PREF,
      },
    });

    // App.mainWindow.setMenu(null);
    App.openedWindows[windowType].center();

    // if main window is ready to show, close the splash window and show the main window
    App.openedWindows[windowType].once(ElectronAppEvents.READY_TO_SHOW, () => {
      App.openedWindows[windowType].show();
    });

    // handle all external redirects in a new browser window
    // App.mainWindow.webContents.on('will-navigate', App.onRedirect);
    // App.mainWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
    //     App.onRedirect(event, url);
    // });
  }
}
