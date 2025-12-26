/**
 * This module is responsible on handling all the inter process communications
 * between the frontend to the electron backend.
 */

import { app, ipcMain, screen } from 'electron';
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
    console.log('close window ',event.processId , args);
    if (!App.openedWindows[args.type]) {
      return;
    }
    if (args.type === AppWindowTypes.MAIN) {
      Array.from(Object.entries(App.openedWindows))
        .filter(([key, browserWindow]) => key !== AppWindowTypes.MAIN)
        .forEach(([key, browserWindow]) => {
          App.onClose(key as AppWindowTypes);

          if (browserWindow && !browserWindow.isDestroyed()) {
            browserWindow?.destroy();
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

ipcMain.handle(ElectronActionEvents.LOAD_QUIZ_STATE, async () => {
  const file = path.join(app.getPath('userData'), 'quiz.json');
  try {
    const raw = await fs.promises.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle(
  ElectronActionEvents.SAVE_QUIZ_STATE,
  async (_event, quizState) => {
    const file = path.join(app.getPath('userData'), 'quiz.json');
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(
      file,
      JSON.stringify(quizState, null, 2),
      'utf-8',
    );
  },
);

// === Multi-quiz management: separate quiz-*.json files with metadata ===

const getQuizzesDir = () => path.join(app.getPath('userData'), 'quizzes');

ipcMain.handle(ElectronActionEvents.LIST_QUIZZES, async () => {
  const dir = getQuizzesDir();
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const files = await fs.promises.readdir(dir);
    const items = await Promise.all(
      files
        .filter((f) => f.toLowerCase().endsWith('.json'))
        .map(async (file) => {
          const full = path.join(dir, file);
          try {
            const raw = await fs.promises.readFile(full, 'utf-8');
            const data = JSON.parse(raw) as any;
            const id = (data && data.id) || path.basename(file, '.json');
            const title = (data && data.title) || id;
            const date = (data && data.date) || '';
            return { id, title, date };
          } catch {
            const id = path.basename(file, '.json');
            return { id, title: id, date: '' };
          }
        })
    );
    return items;
  } catch {
    return [];
  }
});

ipcMain.handle(
  ElectronActionEvents.LOAD_QUIZ_BY_ID,
  async (_event, id: string) => {
    if (!id) {
      return null;
    }
    const dir = getQuizzesDir();
    const file = path.join(dir, `${id}.json`);
    try {
      const raw = await fs.promises.readFile(file, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
);

ipcMain.handle(
  ElectronActionEvents.SAVE_QUIZ_AS_NEW,
  async (
    _event,
    payload: { id?: string; title?: string; date?: string; state: any },
  ) => {
    const dir = getQuizzesDir();
    await fs.promises.mkdir(dir, { recursive: true });

    const now = new Date();
    const isoSafe = now.toISOString().replace(/[:.]/g, '-');
    const id = (payload.id && String(payload.id)) || `quiz-${isoSafe}`;
    const file = path.join(dir, `${id}.json`);

    const title = payload.title?.trim() || id;
    const date = payload.date || now.toISOString().slice(0, 10);

    const body = {
      id,
      title,
      date,
      ...(payload.state || {}),
    };

    await fs.promises.writeFile(
      file,
      JSON.stringify(body, null, 2),
      'utf-8',
    );

    return { id };
  },
);

ipcMain.handle(
  ElectronActionEvents.DELETE_QUIZ,
  async (_event, id: string) => {
    if (!id) {
      return;
    }
    const dir = getQuizzesDir();
    const file = path.join(dir, `${id}.json`);
    try {
      await fs.promises.unlink(file);
    } catch {
      // ignore
    }
  },
);
//
// todo УДАЛИТЬ т.к. неудобно использовать "голые" воркеры оч сложно подключать к ним какие-то фреймворки
//
// const pool = new FileWorkerPool({ threads: 2 });
// ipcMain.handle(ElectronBibleActionEvents.GET_TRANSLATES, (event, ...args) => {
//   return pool.request({ action: 'getTranslates', payload: null });
// });
