import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
  session,
  shell,
} from 'electron';
import { rendererAppName, rendererAppPort } from './constants';
import { environment } from '../environments/environment';
import { join } from 'path';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import * as process from 'node:process';
import { ElectronAppEvents, ElectronCommonEvents } from './events/events.types';
import {
  debounceTime,
  distinctUntilChanged,
  fromEvent,
  Subscription,
} from 'rxjs';
import { WorkersRegistry } from '@lyri-cast/worker-kit';
import { WORKER_SPECS } from './workers.config';
import { registerSvcProtocol } from './api/svc.protocol';
import { startFileServer } from './server';
import * as http from 'http';
import { runDatabaseMigrations } from './migrations';
import { configureAppPathsEnv } from './paths';
import { ensureBiblesUnpacked } from './bibles-assets';
import { migrateUserDataFromOldLocations } from './user-data-migration';

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
  static fileServer: http.Server | null = null;
  static fileServerPort: number | null = null;

  static openedWindows: Partial<
    Record<AppWindowTypes, Electron.BrowserWindow>
  > = {};

  static castingWindows = new Map<string, Electron.BrowserWindow>();
  static castingWindowProcessIds = new Map<number, string>();

  static openedWindowTypesByProcess: Record<number, AppWindowTypes> = {};

  public static closeCastingWindow(channelId: string) {
    const win = App.castingWindows.get(channelId);
    if (win) {
      if (!win.isDestroyed()) {
        win.destroy();
      }
      App.castingWindows.delete(channelId);
    }
    if (App.castingWindows.size === 0) {
      App.openedWindows[AppWindowTypes.CASTING] = null;
    }
  }

  public static closeAllCastingWindows() {
    App.castingWindows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
    });
    App.castingWindows.clear();
    App.castingWindowProcessIds.clear();
    App.openedWindows[AppWindowTypes.CASTING] = null;
  }

  public static isDevelopmentMode() {
    const isEnvironmentSet: boolean = 'ELECTRON_IS_DEV' in process.env;
    const getFromEnvironment: boolean =
      parseInt(process.env.ELECTRON_IS_DEV, 10) === 1;

    return isEnvironmentSet ? getFromEnvironment : !environment.production;
  }

  public static onClose(type: AppWindowTypes, channelId?: string) {
    if (type === AppWindowTypes.CASTING) {
      if (channelId) {
        App.closeCastingWindow(channelId);
      } else {
        App.closeAllCastingWindows();
      }
      return;
    }

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
    options: BrowserWindowConstructorOptions,
    channelId?: string
  ): BrowserWindow {
    const win = new BrowserWindow(options);
    const processId = win.webContents.getProcessId();

    if (type === AppWindowTypes.CASTING) {
      const actualChannelId = channelId || 'main';
      App.castingWindows.set(actualChannelId, win);
      App.castingWindowProcessIds.set(processId, actualChannelId);
      if (!App.openedWindows[AppWindowTypes.CASTING] || actualChannelId === 'main') {
        App.openedWindows[AppWindowTypes.CASTING] = win;
      }
    } else {
      App.openedWindows[type] = win;
    }

    App.openedWindowTypesByProcess[processId] = type;

    const subs: Subscription[] = [];

    win.on(ElectronAppEvents.CLOSE, () => {
      if (type !== AppWindowTypes.MAIN) {
        const associatedChannelId = App.castingWindowProcessIds.get(processId);
        if (associatedChannelId) {
          App.castingWindows.delete(associatedChannelId);
          App.castingWindowProcessIds.delete(processId);
          if (App.castingWindows.size === 0) {
            App.openedWindows[AppWindowTypes.CASTING] = null;
          }
        }
        if (App.openedWindows[AppWindowTypes.MAIN] && !App.openedWindows[AppWindowTypes.MAIN].isDestroyed()) {
          App.openedWindows[AppWindowTypes.MAIN].webContents.send(
            ElectronCommonEvents.RECEIVE,
            JSON.stringify({
              event: APP_COMMON_ACTIONS.closeWindow,
              payload: { processId, channelId: associatedChannelId },
            })
          );
        }
      } else {
        App.closeAllCastingWindows();
      }
    });

    win.on(ElectronAppEvents.CLOSED, () => {
      if (type === AppWindowTypes.MAIN) {
        App.openedWindows[type] = null;
      }
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

  public static loadWindow(windowType: AppWindowTypes, channelId?: string) {
    // load the index.html of the app.
    let urlObject: URL | null = null;

    if (!App.application.isPackaged) {
      urlObject = new URL(`http://localhost:${rendererAppPort}`);
    } else {
      urlObject = new URL(`http://localhost:${App.fileServerPort}`);
    }

    let openedWindow: Electron.BrowserWindow | null | undefined = null;
    if (windowType === AppWindowTypes.CASTING) {
      openedWindow = channelId ? App.castingWindows.get(channelId) : App.openedWindows[AppWindowTypes.CASTING];
    } else {
      openedWindow = App.openedWindows[windowType];
    }

    if (!openedWindow) {
      return;
    }

    openedWindow.loadURL(urlObject.href).then(() => {
      if (windowType === AppWindowTypes.MAIN && !App.application.isPackaged) {
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

          if (!openedWindow || openedWindow.isDestroyed()) {
            return;
          }

          //удалить
          // openedWindow.setFullScreen(true);

          App.application.focus({ steal: true });
          //удалить
          // App.openedWindows.MAIN.show();
          App.openedWindows.MAIN.focus();

          if (!App.application.isPackaged) {
            // открываем devTools для отладки//
            App.BrowserWindow.getAllWindows()[0].webContents.openDevTools();
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
    App.application.on('before-quit', () => {
      if (App.workers) {
        App.workers.disposeAll();
      }
      if (App.fileServer) {
        App.fileServer.close();
      }
    });

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
    // Configure all important paths and environment variables in one place
    configureAppPathsEnv();
    // console.log('process.env', process.env);

    // Гарантируем наличие распакованных переводов Библии в user-assets
    await ensureBiblesUnpacked();

    // One-time migration from old resources-based locations to userData
    await migrateUserDataFromOldLocations();

    await runDatabaseMigrations();

    if (App.application.isPackaged) {
      try {
        const { server, port } = await startFileServer();
        App.fileServer = server;
        App.fileServerPort = port;
      } catch (e) {
        console.error('[FileServer] Failed to start file server', e);
        // Optional: Add error handling, like showing a dialog to the user
        App.application.quit();
        return;
      }
    }

    // Clear YouTube cookies as a potential fix for embed errors
    const clearYouTubeCookies = async () => {
      const youtubeDomains = [
        'https://youtube.com',
        'https://www.youtube-nocookie.com',
      ];
      const ses = session.defaultSession;

      for (const domain of youtubeDomains) {
        try {
          const cookies = await ses.cookies.get({ url: domain });
          for (const cookie of cookies) {
            await ses.cookies.remove(domain, cookie.name);
          }
          console.log(
            `[CookieClear] Cleared ${cookies.length} cookies for ${domain}`
          );
        } catch (error) {
          console.error(
            `[CookieClear] Failed to clear cookies for ${domain}`,
            error
          );
        }
      }
    };
    await clearYouTubeCookies();

    const isDev = !app.isPackaged;

    App.workers = new WorkersRegistry(
      WORKER_SPECS.map((spec) => ({
        ...spec,
        devWatch: isDev,
      }))
    );
    registerSvcProtocol(App.workers);

    try {
      await App.workers.waitAllReady(5000);
      console.log('workers are ready!!!');
    } catch (err: any) {
      console.log('workers are not ready!!!', err);
      App.workers.disposeAll();
      App.application.quit();
    }


    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    if (rendererAppName) {
      App.initMainWindow();
      App.loadWindow(AppWindowTypes.MAIN);
    }

    // (опционально) лог/метрики
    App.workers.on('worker:ready', (e) => console.log('[worker-ready]', e));
    App.workers.on('worker:reready', (e) => console.log('[worker-reready]', e));
    App.workers.on('worker:exit', (e) => console.warn('[worker-exit]', e));
    App.workers.on('worker:error', (e) => console.error('[worker-error]', e));
    App.workers.on('worker:event', (e) => console.log('[worker-event]', e));
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
      icon: join(
        __dirname,
        '..',
        '..',
        '..',
        'assets',
        'build',
        'icons',
        'lyriicon.ico'
      ),
      fullscreen: false,
      backgroundMaterial: 'none',
      backgroundColor: '#000',
      webPreferences: {
        ...DEFAULT_WEB_PREF,
      },
    });

    // Set a Content Security Policy
    App.openedWindows[
      windowType
    ].webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const isAppResponse = (() => {
        try {
          const url = new URL(details.url);
          const allowedPorts = [
            rendererAppPort.toString(),
            App.fileServerPort?.toString(),
          ].filter((port): port is string => Boolean(port));

          return url.hostname === 'localhost' && allowedPorts.includes(url.port);
        } catch {
          return false;
        }
      })();

      if (!isAppResponse) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'; worker-src 'self' blob:; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com;",
          ],
        },
      });
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
