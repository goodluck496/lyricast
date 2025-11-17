import SquirrelEvents from './app/events/squirrel.events';
import ElectronEvents from './app/events/electron.events';
import UpdateEvents from './app/events/update.events';
import { app, BrowserWindow, protocol } from 'electron';
import App from './app/app';

export default class Main {
  static initialize() {
    // Set basic flag for packaged state; detailed paths are configured in App.onReady
    process.env.IS_PACKAGED = String(app.isPackaged);

    if (SquirrelEvents.handleEvents()) {
      // squirrel event handled (except first run event) and app will exit in 1000ms, so don't do anything else
      app.quit();
    }

    /**
     * Регистрируем протокол для взаимодействия фронта с воркерами не светя при этом реальные порты и прочее
     */
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'svc',
        privileges: {
          secure: true,
          standard: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
        },
      },
    ]);
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
}

// handle setup events as quickly as possible
Main.initialize();

// bootstrap app
Main.bootstrapApp();
Main.bootstrapAppEvents();
