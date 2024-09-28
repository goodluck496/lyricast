import { contextBridge, ipcRenderer } from 'electron';
import { ElectronActionEvents } from '../events/events.types';

contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke(ElectronActionEvents.GET_APP_VERSION),
  ping: () => ipcRenderer.invoke(ElectronActionEvents.PING),
  platform: process.platform,
});
