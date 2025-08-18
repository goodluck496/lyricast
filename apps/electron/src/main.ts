import SquirrelEvents from './app/events/squirrel.events';
import ElectronEvents from './app/events/electron.events';
import UpdateEvents from './app/events/update.events';
import { app, BrowserWindow } from 'electron';
import App from './app/app';
import * as process from 'node:process';
import { environment } from './environments/environment';

export default class Main {
  static initialize() {
    if (SquirrelEvents.handleEvents()) {
      // squirrel event handled (except first run event) and app will exit in 1000ms, so don't do anything else
      app.quit();
    }
  }

  static bootstrapApp() {
    App.main(app, BrowserWindow);
  }

  static bootstrapAppEvents() {
    ElectronEvents.bootstrapElectronEvents();

    // initialize auto updater service
    if (!App.isDevelopmentMode()) {
      UpdateEvents.initAutoUpdateService();
    }
  }

  static bootstrapBackend() {
    console.log('run backend?', environment.production);
    if (!environment.production) {
      return;
    }
    console.log('yes');

    const child = require('child_process');
    const path = require('path');

    const procPath = process.resourcesPath;
    const backPath = path.resolve([procPath, 'backend', 'main.js'].join('/'));

    console.log('path', backPath);
    const proc = child.spawn('node', [backPath]);
    proc.stdout.on('data', (data) => {
      console.log('---data---', data.toString());
    });
    console.log('proc.stdout.eventNames()--', proc.stdout.eventNames());

    proc.stderr.on('error', (data) => {
      console.log('---error---', data.toString());
    });

    proc.on('close', (data) => {
      console.log('--closed--', data);
    });
  }
}

// handle setup events as quickly as possible
Main.initialize();

// bootstrap app
Main.bootstrapApp();
Main.bootstrapAppEvents();
Main.bootstrapBackend();

//
// const log = require('electron-log');
// const path = require('path');
// const fs = require('fs');
//
// // Устанавливаем путь к папке логов
// // const logDir = path.join(__dirname, 'logs');
// const logDir = path.join('/home/nikita/', 'logs');
//
// // Если папка не существует, создаем её
// if (!fs.existsSync(logDir)) {
//   fs.mkdirSync(logDir);
// }
//
// // Настроим путь для сохранения логов
// log.transports.file.level = 'info';
// log.transports.file.file = path.join(logDir, 'app.log');
//
// // Записываем лог
// log.info('Приложение запущено');
// log.error('Ошибка в приложении');
//
// // Настройка консольного вывода
// log.consoleLevel = 'info';
//
//
// import { Worker } from 'worker_threads';
// import path from 'path';
// import { fileURLToPath } from 'url';
//
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
//
// // Путь к .ts файлу воркера
// // const workerPath = path.join(__dirname, './workers/my-first.worker.ts');
// const workerPath = path.join(__dirname, '../../../dist/apps/backend/main.js');
//
// const worker = new Worker(workerPath, {
//   execArgv: ['-r', 'ts-node/register'], // важно для запуска .ts
// });
//
// worker.on('message', (msg) => {
//   console.log('Сообщение от воркера:', msg);
// });
//
// setInterval(() => {
//   worker.postMessage({ text: 'Иисус' + +new Date() });
// }, 500)
//
