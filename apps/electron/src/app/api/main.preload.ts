import { contextBridge, ipcRenderer } from 'electron';
import {
  ElectronActionEvents,
  ElectronAppEvents,
  ElectronCommonEvents,
} from '../events/events.types';
import {
  AppWindowTypes,
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
  closeCastingWindow: (channelId: string) =>
    ipcRenderer.invoke(ElectronActionEvents.CLOSE_WINDOW, { type: AppWindowTypes.CASTING, channelId }),
  closeAllCastingWindows: () =>
    ipcRenderer.invoke(ElectronActionEvents.CLOSE_WINDOW, { type: AppWindowTypes.CASTING }),
  getDisplays: () => ipcRenderer.invoke(ElectronAppEvents.GET_DISPLAYS),
  send: (data: EventData) => {
    const str = JSON.stringify(data);
    return ipcRenderer.invoke(ElectronCommonEvents.SEND, str);
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
  quitAndInstallUpdate: () => {
    ipcRenderer.send('APP_QUIT_AND_INSTALL_UPDATE');
  },
  getAppUpdateStatus: () => ipcRenderer.invoke('APP_GET_UPDATE_STATUS'),
  loadUserSettings: () =>
    ipcRenderer.invoke(ElectronActionEvents.LOAD_SETTINGS),
  saveUserSettings: (settings: unknown) =>
    ipcRenderer.invoke(ElectronActionEvents.SAVE_SETTINGS, settings),
  loginGoogle: () =>
    ipcRenderer.invoke(ElectronActionEvents.LOGIN_GOOGLE),
  getFileServerPort: () => ipcRenderer.invoke('GET_FILE_SERVER_PORT'),
  getNdiStatus: () => ipcRenderer.invoke('GET_NDI_STATUS'),
  startNdiBroadcast: (config: any) =>
    ipcRenderer.invoke('START_NDI_BROADCAST', config),
  stopNdiBroadcast: (channelId: string) =>
    ipcRenderer.invoke('STOP_NDI_BROADCAST', channelId),
} satisfies Context);
