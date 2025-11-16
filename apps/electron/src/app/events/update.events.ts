import { app, dialog, MessageBoxOptions, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import App from '../app';

export default class UpdateEvents {
  static retryTimer: NodeJS.Timeout | null = null;
  static isDownloading = false;

  // Initialize auto update service - must be invoked only in production
  static initAutoUpdateService() {
    if (App.isDevelopmentMode()) {
      console.log('Auto-update is disabled in development mode');
      return;
    }

    try {
      console.log('Initializing auto update service (electron-updater)...');

      // Configure behavior
      autoUpdater.autoDownload = false; // start download only after user confirms
      autoUpdater.autoInstallOnAppQuit = true;
      (autoUpdater as any).disableWebInstaller = true; // remove warning, we don't use web installer
      (autoUpdater as any).disableDifferentialDownload = true; // temporary: avoid broken/handmade blockmaps

      // Start checking after app is ready and then periodically
      app.whenReady().then(() => {
        UpdateEvents.checkForUpdates();
        setInterval(UpdateEvents.checkForUpdates, 60 * 60 * 1000);
        Object.keys(App.openedWindows).forEach((key) => {
          const win = App.openedWindows[key];
          if (win) win.webContents.send('APP_UPDATE_STATUS', { type: 'initialized' });
        });
      });
    } catch (error) {
      console.error('Failed to initialize auto-update service:', error);
    }
  }

  // check for updates - most be invoked after initAutoUpdateService() and only in production
  static checkForUpdates() {
    if (!App.isDevelopmentMode()) {
      autoUpdater.checkForUpdates();
    }
  }
}

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for updates...');
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win) win.webContents.send('APP_UPDATE_STATUS', { type: 'checking-for-update' });
  });
});

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Update available:', info?.version);
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win)
      win.webContents.send('APP_UPDATE_STATUS', {
        type: 'update-available',
        version: info?.version,
      });
  });
  const dialogOpts: MessageBoxOptions = {
    type: 'info',
    buttons: ['Download now', 'Later'],
    title: 'Update available',
    message: 'A new version is available.',
    detail: `Version ${info?.version} is available. Do you want to download it now?`,
  };
  dialog.showMessageBox(dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) {
      if (UpdateEvents.isDownloading) {
        console.log('[Updater] Download already in progress, skipping duplicate start');
        return;
      }
      UpdateEvents.isDownloading = true;
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('download-progress', (progress) => {
  const pct = Math.round(progress.percent ?? 0);
  console.log(`[Updater] Download progress: ${pct}% (${progress.transferred}/${progress.total})`);
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win)
      win.webContents.send('APP_UPDATE_STATUS', {
        type: 'download-progress',
        percent: pct,
        transferred: progress.transferred,
        total: progress.total,
      });
  });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[Updater] Update downloaded:', info?.version);
  UpdateEvents.isDownloading = false;
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win)
      win.webContents.send('APP_UPDATE_STATUS', {
        type: 'update-downloaded',
        version: info?.version,
      });
  });
  const dialogOpts: MessageBoxOptions = {
    type: 'info',
    buttons: ['Restart', 'Later'],
    title: 'Update ready',
    message: 'The update has been downloaded.',
    detail: 'Restart the application to apply the update now?',
  };
  dialog.showMessageBox(dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('[Updater] Application is up to date');
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win) win.webContents.send('APP_UPDATE_STATUS', { type: 'update-not-available' });
  });
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Error while updating the application');
  console.error(err);
  UpdateEvents.isDownloading = false;

  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win)
      win.webContents.send('APP_UPDATE_STATUS', {
        type: 'error',
        message: String(err?.message || err),
      });
  });

  // Retry once in 5 minutes to handle cases when app started offline
  if (!App.isDevelopmentMode()) {
    if (UpdateEvents.retryTimer) {
      clearTimeout(UpdateEvents.retryTimer);
      UpdateEvents.retryTimer = null;
    }
    UpdateEvents.retryTimer = setTimeout(() => {
      UpdateEvents.retryTimer = null;
      UpdateEvents.checkForUpdates();
    }, 5 * 60 * 1000);
  }
});

// Allow renderer to trigger manual update check
ipcMain.on('APP_FORCE_CHECK_UPDATE', () => {
  UpdateEvents.checkForUpdates();
});
