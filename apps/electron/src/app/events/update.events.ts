import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import App from '../app';
import * as fs from 'fs';
import * as path from 'path';

export default class UpdateEvents {
  static retryTimer: NodeJS.Timeout | null = null;
  static isDownloading = false;
  static lastStatus: any = null;

  // Initialize auto update service - must be invoked only in production
  static initAutoUpdateService() {
    if (App.isDevelopmentMode()) {
      console.log('Auto-update is disabled in development mode');
      return;
    }

    try {
      console.log('Initializing auto update service (electron-updater)...');

      // Configure behavior - silent auto-download without user prompt
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      (autoUpdater as any).disableWebInstaller = true; // remove warning, we don't use web installer
      (autoUpdater as any).disableDifferentialDownload = true; // temporary: avoid broken/handmade blockmaps

      // Start checking after app is ready and then periodically
      app.whenReady().then(() => {
        UpdateEvents.checkForUpdates();
        setInterval(UpdateEvents.checkForUpdates, 60 * 60 * 1000);
        UpdateEvents.lastStatus = { type: 'initialized' };
        Object.keys(App.openedWindows).forEach((key) => {
          const win = App.openedWindows[key];
          if (win) win.webContents.send('APP_UPDATE_STATUS', UpdateEvents.lastStatus);
        });
      });
    } catch (error) {
      console.error('Failed to initialize auto-update service:', error);
    }
  }

  // check for updates - most be invoked after initAutoUpdateService() and only in production
  static checkForUpdates() {
    if (!App.isDevelopmentMode()) {
      const updateFile = path.join(process.resourcesPath, 'app-update.yml');
      if (fs.existsSync(updateFile)) {
        autoUpdater.checkForUpdates();
      } else {
        console.log('[Updater] app-update.yml not found, skipping update check.');
      }
    }
  }
}

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for updates...');
  UpdateEvents.lastStatus = { type: 'checking-for-update' };
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win) win.webContents.send('APP_UPDATE_STATUS', UpdateEvents.lastStatus);
  });
});

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Update available:', info?.version);
  UpdateEvents.isDownloading = true;
  UpdateEvents.lastStatus = {
    type: 'update-available',
    version: info?.version,
  };
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win)
      win.webContents.send('APP_UPDATE_STATUS', UpdateEvents.lastStatus);
  });
  // Auto-download is enabled (autoUpdater.autoDownload = true), so download starts silently without modal prompt.
});

autoUpdater.on('download-progress', (progress) => {
  const pct = Math.round(progress.percent ?? 0);
  console.log(`[Updater] Download progress: ${pct}% (${progress.transferred}/${progress.total})`);
  UpdateEvents.isDownloading = true;
  UpdateEvents.lastStatus = {
    type: 'download-progress',
    percent: pct,
    transferred: progress.transferred,
    total: progress.total,
  };
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win)
      win.webContents.send('APP_UPDATE_STATUS', UpdateEvents.lastStatus);
  });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[Updater] Update downloaded:', info?.version);
  UpdateEvents.isDownloading = false;
  UpdateEvents.lastStatus = {
    type: 'update-downloaded',
    version: info?.version,
  };
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win)
      win.webContents.send('APP_UPDATE_STATUS', UpdateEvents.lastStatus);
  });
  // Download finished silently. The UI badge & hover overlay will allow the user to install on click.
});

autoUpdater.on('update-not-available', () => {
  console.log('[Updater] Application is up to date');
  UpdateEvents.isDownloading = false;
  UpdateEvents.lastStatus = { type: 'update-not-available' };
  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win) win.webContents.send('APP_UPDATE_STATUS', UpdateEvents.lastStatus);
  });
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Error while updating the application');
  console.error(err);
  UpdateEvents.isDownloading = false;
  UpdateEvents.lastStatus = {
    type: 'error',
    message: String(err?.message || err),
  };

  Object.keys(App.openedWindows).forEach((key) => {
    const win = App.openedWindows[key];
    if (win)
      win.webContents.send('APP_UPDATE_STATUS', UpdateEvents.lastStatus);
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

// Allow renderer to query current status
ipcMain.handle('APP_GET_UPDATE_STATUS', () => {
  return UpdateEvents.lastStatus;
});

// Allow renderer to trigger manual update check
ipcMain.on('APP_FORCE_CHECK_UPDATE', () => {
  UpdateEvents.checkForUpdates();
});

// Allow renderer to trigger silent quit and install update without extra dialogs
ipcMain.on('APP_QUIT_AND_INSTALL_UPDATE', () => {
  console.log('[Updater] Quitting and installing update...');
  autoUpdater.quitAndInstall(true, true);
});
