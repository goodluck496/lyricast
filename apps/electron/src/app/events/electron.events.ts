/**
 * This module is responsible on handling all the inter process communications
 * between the frontend to the electron backend.
 */

import { app, ipcMain } from 'electron';
import { environment } from '../../environments/environment';
import { ElectronActionEvents } from './events.types';

export default class ElectronEvents {
  static bootstrapElectronEvents(): Electron.IpcMain {
    return ipcMain;
  }
}

// Retrieve app version
ipcMain.handle(ElectronActionEvents.GET_APP_VERSION, (event) => {
  console.log(`Fetching application version... [v${environment.version}]`);

  return environment.version;
});

ipcMain.handle(ElectronActionEvents.PING, (event) => {
  event.sender.send('ping', 'pong');
})

// Handle App termination
ipcMain.on('quit', (event, code) => {
  app.exit(code);
});
