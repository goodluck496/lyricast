import { contextBridge, ipcRenderer } from 'electron';
import { ElectronActionEvents } from '../events/events.types';
import {
  CloseWindowArgs,
  Context,
  ElectronEvents,
  EventData,
  OpenWindowArgs,
} from '@lyri-cast/common-electron';

contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke(ElectronActionEvents.GET_APP_VERSION),
  platform: process.platform,
  openWindow: (arg: OpenWindowArgs) =>
    ipcRenderer.invoke(ElectronActionEvents.OPEN_WINDOW, arg),
  closeWindow: (arg: CloseWindowArgs) =>
    ipcRenderer.invoke(ElectronActionEvents.CLOSE_WINDOW, arg),

  send: (data: EventData<ElectronEvents>) =>
    ipcRenderer.send('send', JSON.stringify(data)),
  receive: (resEvent, callback) =>
    ipcRenderer.on('receive', (senderEvent, data) => {
      const payload = JSON.parse(data);

      if (payload && resEvent !== payload.event) {
        return;
      }

      callback(payload);
    }),
} satisfies Context);
