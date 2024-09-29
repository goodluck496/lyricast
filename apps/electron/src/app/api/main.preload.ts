import { contextBridge, ipcRenderer } from 'electron';
import { ElectronActionEvents } from '../events/events.types';
import { CloseWindowArgs, Context, OpenWindowArgs } from '@lyri-cast/common-electron';

contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke(ElectronActionEvents.GET_APP_VERSION),
  platform: process.platform,
  openWindow: (arg: OpenWindowArgs) =>
    ipcRenderer.invoke(ElectronActionEvents.OPEN_SECOND_WINDOW, arg),
  closeWindow: (arg: CloseWindowArgs) =>
    ipcRenderer.invoke(ElectronActionEvents.CLOSE_SECOND_WINDOW, arg),
} satisfies Context);
