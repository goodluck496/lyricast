export const ElectronActionEvents = {
  GET_APP_VERSION: 'GET_APP_VERSION',
  GET_WINDOW_TYPE: 'GET_WINDOW_TYPE',
  OPEN_WINDOW: 'OPEN_WINDOW',
  CLOSE_WINDOW: 'CLOSE_WINDOW',
  PING: 'PING',
  LOAD_SETTINGS: 'LOAD_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  LOAD_QUIZ_STATE: 'LOAD_QUIZ_STATE',
  SAVE_QUIZ_STATE: 'SAVE_QUIZ_STATE',
  LIST_QUIZZES: 'LIST_QUIZZES',
  LOAD_QUIZ_BY_ID: 'LOAD_QUIZ_BY_ID',
  SAVE_QUIZ_AS_NEW: 'SAVE_QUIZ_AS_NEW',
  DELETE_QUIZ: 'DELETE_QUIZ',
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
  GET_DISPLAYS: 'get-displays',
} as const;

//перенести в libs
export const ElectronBibleActionEvents = {
  GET_TRANSLATES: 'GET_TRANSLATES',
};
