import { contextBridge, ipcRenderer } from 'electron';
import {
  ElectronActionEvents,
  ElectronAppEvents,
  ElectronCommonEvents,
} from '../events/events.types';
import {
  CloseWindowArgs,
  Context,
  EventData,
  OpenWindowArgs,
} from '@lyri-cast/common-electron';

contextBridge.exposeInMainWorld('electron', {
  getWindowType: () => ipcRenderer.invoke(ElectronActionEvents.GET_WINDOW_TYPE),
  getAppVersion: () => ipcRenderer.invoke(ElectronActionEvents.GET_APP_VERSION),
  platform: process.platform,
  openWindow: (arg: OpenWindowArgs) =>
    ipcRenderer.invoke(ElectronActionEvents.OPEN_WINDOW, arg),
  closeWindow: (arg: CloseWindowArgs) =>
    ipcRenderer.invoke(ElectronActionEvents.CLOSE_WINDOW, arg),
  getDisplays: () => ipcRenderer.invoke(ElectronAppEvents.GET_DISPLAYS),
  send: (data: EventData) => {
    return ipcRenderer.invoke(ElectronCommonEvents.SEND, JSON.stringify(data));
  },
  receive: (callback) => {
    ipcRenderer.on(ElectronCommonEvents.RECEIVE, (senderEvent, data) => {
      const payload = JSON.parse(data);
      callback(payload.event, payload);
    });
  },
  onAppUpdateStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('APP_UPDATE_STATUS', (_event, payload) => {
      callback(payload);
    });
  },
  checkForAppUpdates: () => {
    ipcRenderer.send('APP_FORCE_CHECK_UPDATE');
  },
  loadUserSettings: () => ipcRenderer.invoke(ElectronActionEvents.LOAD_SETTINGS),
  saveUserSettings: (settings: unknown) =>
    ipcRenderer.invoke(ElectronActionEvents.SAVE_SETTINGS, settings),
  loadQuizState: () => ipcRenderer.invoke(ElectronActionEvents.LOAD_QUIZ_STATE),
  saveQuizState: (state: unknown) =>
    ipcRenderer.invoke(ElectronActionEvents.SAVE_QUIZ_STATE, state),
} satisfies Context);
