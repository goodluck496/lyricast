import { NdiBroadcasterService, NdiStreamConfig } from '../ndi/ndi.service';
/**
 * This module is responsible on handling all the inter process communications
 * between the frontend to the electron backend.
 */

import { app, ipcMain, screen, shell } from 'electron';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
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
  const v = app.getVersion();
  console.log(`Fetching application version... [v${v}]`);
  return v;
});

ipcMain.handle(
  ElectronActionEvents.OPEN_WINDOW,
  (event, args: OpenWindowArgs) => {
    console.log(`OpenWindow event: `, event, args);

    if (args.type === AppWindowTypes.CASTING) {
      const channelId = args.channelId || 'main';
      const existing = App.castingWindows.get(channelId);
      if (existing && !existing.isDestroyed()) {
        existing.focus();
        return existing.webContents.getProcessId();
      }

      let winOptions: any;
      if (args.emulated) {
        winOptions = {
          webPreferences: {
            ...DEFAULT_WEB_PREF,
          },
          width: 1280,
          height: 720,
          fullscreenable: true,
          fullscreen: false,
          alwaysOnTop: false,
          frame: true,
          title: `[LyriCast Эмуляция] ${args.title || channelId}`,
          backgroundColor: '#000000',
          show: true,
          opacity: 0,
        };
      } else {
        const { x, y, width, height } = args.display?.bounds || { x: 0, y: 0, width: 1920, height: 1080 };
        winOptions = {
          webPreferences: {
            ...DEFAULT_WEB_PREF,
          },
          x,
          y,
          width,
          height,
          fullscreenable: true,
          fullscreen: true,
          alwaysOnTop: true,
          ...args,
          backgroundColor: '#000000',
          show: true,
          frame: false,
          opacity: 0,
        };
      }

      const win = App.createWindow(args.type, winOptions, channelId);
      App.loadWindow(args.type, channelId);

      win.once(ElectronAppEvents.READY_TO_SHOW, () => {
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.setOpacity(1);
          }
        }, 800);
      });

      win.menuBarVisible = false;
      return win.webContents.getProcessId();
    }
  }
);

ipcMain.handle(
  ElectronActionEvents.CLOSE_WINDOW,
  (event, args: CloseWindowArgs) => {
    console.log('close window ', event.processId, args);
    if (args.type === AppWindowTypes.MAIN) {
      App.closeAllCastingWindows();
      Array.from(Object.entries(App.openedWindows))
        .filter(([key, browserWindow]) => key !== AppWindowTypes.MAIN)
        .forEach(([key, browserWindow]) => {
          App.onClose(key as AppWindowTypes);

          if (browserWindow && !browserWindow.isDestroyed()) {
            browserWindow?.destroy();
          }
        });
    } else if (args.type === AppWindowTypes.CASTING) {
      if (args.channelId) {
        App.closeCastingWindow(args.channelId);
      } else {
        App.closeAllCastingWindows();
      }
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

ipcMain.handle(ElectronCommonEvents.SEND, (event, rawPayload) => {
  let targetChannelId: string | string[] | undefined;

  try {
    const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    if (parsed && parsed.targetChannelId) {
      targetChannelId = parsed.targetChannelId;
    }
  } catch {
    // raw payload might not be JSON
  }

  // 1. Send to mainWindow if sender is not mainWindow
  const mainWindow = App.openedWindows[AppWindowTypes.MAIN];
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id !== event.sender.id) {
    mainWindow.webContents.send(ElectronCommonEvents.RECEIVE, rawPayload);
  }

  // 2. Send to casting windows
  App.castingWindows.forEach((castingWin, channelId) => {
    if (!castingWin || castingWin.isDestroyed()) return;
    if (castingWin.webContents.id === event.sender.id) return;

    if (targetChannelId) {
      const targets = Array.isArray(targetChannelId) ? targetChannelId : [targetChannelId];
      if (!targets.includes(channelId)) {
        return;
      }
    }

    castingWin.webContents.send(ElectronCommonEvents.RECEIVE, rawPayload);
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

ipcMain.handle(ElectronActionEvents.LOAD_SETTINGS, async () => {
  const file = path.join(app.getPath('userData'), 'settings.json');
  try {
    const raw = await fs.promises.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle(ElectronActionEvents.SAVE_SETTINGS, async (_event, settings) => {
  const file = path.join(app.getPath('userData'), 'settings.json');
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(settings, null, 2), 'utf-8');
});

ipcMain.handle(ElectronActionEvents.LOGIN_GOOGLE, async () => {
  return new Promise<{ ok: boolean; token?: string; email?: string; name?: string; error?: string }>((resolve) => {
    let server: http.Server | null = null;
    let resolved = false;

    const cleanup = () => {
      if (server) {
        try {
          server.close();
        } catch {
          // ignore
        }
        server = null;
      }
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ ok: false, error: 'auth_timeout' });
      }
    }, 5 * 60 * 1000);

    server = http.createServer((req, res) => {
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      if (u.pathname === '/callback') {
        const token = u.searchParams.get('token');
        const email = u.searchParams.get('email');
        const name = u.searchParams.get('name');
        const error = u.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (token) {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>LyriCast Вход</title><meta charset="utf-8"/></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 80vh; background: #f8fafc; margin: 0;">
                <div style="background: #ffffff; padding: 36px 32px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); text-align: center; max-width: 420px; width: 90%;">
                  <div style="font-size: 48px; margin-bottom: 12px;">✓</div>
                  <h2 style="color: #16a34a; margin: 0 0 10px; font-size: 22px;">Вход выполнен успешно!</h2>
                  <p style="color: #64748b; font-size: 15px; line-height: 1.5; margin: 0 0 16px;">Вы можете закрыть эту вкладку браузера и вернуться в приложение LyriCast.</p>
                  <div style="font-size: 13px; color: #94a3b8;">${email || ''}</div>
                </div>
              </body>
            </html>
          `);
        } else {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>LyriCast Ошибка</title><meta charset="utf-8"/></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 80vh; background: #fef2f2; margin: 0;">
                <div style="background: #ffffff; padding: 36px 32px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); text-align: center; max-width: 420px; width: 90%;">
                  <div style="font-size: 48px; color: #dc2626; margin-bottom: 12px;">✕</div>
                  <h2 style="color: #dc2626; margin: 0 0 10px; font-size: 22px;">Ошибка входа</h2>
                  <p style="color: #64748b; font-size: 15px; line-height: 1.5; margin: 0;">${error === 'blocked' ? 'Пользователь заблокирован администратором' : (error || 'Не удалось выполнить вход')}</p>
                </div>
              </body>
            </html>
          `);
        }

        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          setTimeout(() => cleanup(), 1000);

          if (token) {
            resolve({ ok: true, token, email: email || undefined, name: name || undefined });
          } else {
            resolve({ ok: false, error: error || 'unknown_error' });
          }
        }
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address();
      if (!addr || typeof addr === 'string') {
        cleanup();
        resolve({ ok: false, error: 'failed_to_bind_loopback' });
        return;
      }
      const port = addr.port;
      const apiBase =
        process.env['DICTIONARY_API_URL'] ||
        (process.env['NODE_ENV'] === 'production'
          ? 'https://lyricast-dictionary-api.onrender.com'
          : 'http://localhost:3000');
      const authUrl = `${apiBase.replace(/\/+$/, '')}/api/auth/google?source=desktop&redirect_port=${port}`;
      shell.openExternal(authUrl);
    });
  });
});

//
// todo УДАЛИТЬ т.к. неудобно использовать "голые" воркеры оч сложно подключать к ним какие-то фреймворки
//
// const pool = new FileWorkerPool({ threads: 2 });
// ipcMain.handle(ElectronBibleActionEvents.GET_TRANSLATES, (event, ...args) => {
//   return pool.request({ action: 'getTranslates', payload: null });
// });

ipcMain.handle('GET_FILE_SERVER_PORT', () => {
  return App.fileServerPort;
});

ipcMain.handle('GET_NDI_STATUS', () => {
  return NdiBroadcasterService.getInstance().getStatus();
});

ipcMain.handle('START_NDI_BROADCAST', (_event, config: NdiStreamConfig) => {
  return NdiBroadcasterService.getInstance().startBroadcast(config);
});

ipcMain.handle('STOP_NDI_BROADCAST', (_event, channelId: string) => {
  return NdiBroadcasterService.getInstance().stopBroadcast(channelId);
});
