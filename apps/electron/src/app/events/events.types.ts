export const ElectronActionEvents = {
  GET_APP_VERSION: 'GET_APP_VERSION',
  GET_WINDOW_TYPE: 'GET_WINDOW_TYPE',
  OPEN_WINDOW: 'OPEN_WINDOW',
  CLOSE_WINDOW: 'CLOSE_WINDOW',
  PING: 'PING',
} as const;

export const ElectronCommonEvents = {
  SEND: 'send',
  RECEIVE: 'receive',
} as const;

export const ElectronAppEvents = {
  CLOSE: 'close',
  CLOSED: 'closed',
  READY_TO_SHOW: 'ready-to-show',
  WINDOW_ALL_CLOSED: 'window-all-closed',
  READY: 'ready',
  ACTIVATE: 'activate',
} as const;
