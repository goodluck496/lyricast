import { app, autoUpdater, dialog, MessageBoxOptions } from 'electron';
import { arch, platform } from 'os';
import { updateServerUrl } from '../constants';
import App from '../app';

export default class UpdateEvents {
  // Initialize auto update service - must be invoked only in production
  static initAutoUpdateService() {
    if (App.isDevelopmentMode()) {
      console.log('Auto-update is disabled in development mode');
      return;
    }

    try {
      const platform_arch =
        platform() === 'win32' ? 'win' : `${platform()}_${arch()}`;
      const version = app.getVersion();

      if (!updateServerUrl) {
        console.error('Update server URL is not configured');
        return;
      }

      const feed: Electron.FeedURLOptions = {
        url: `${updateServerUrl}/update/${platform_arch}/${version}`,
      };

      console.log('Initializing auto update service...');
      console.log('Feed URL:', feed.url);

      autoUpdater.setFeedURL(feed);

      // Check for updates immediately and then every hour
      UpdateEvents.checkForUpdates();
      setInterval(UpdateEvents.checkForUpdates, 60 * 60 * 1000);
    } catch (error) {
      console.error('Failed to initialize auto-update service:', error);
    }
  }

  // check for updates - most be invoked after initAutoUpdateService() and only in production
  static checkForUpdates() {
    if (!App.isDevelopmentMode() && autoUpdater.getFeedURL() !== '') {
      autoUpdater.checkForUpdates();
    }
  }
}

autoUpdater.on(
  'update-downloaded',
  (event, releaseNotes, releaseName, releaseDate) => {
    const dialogOpts: MessageBoxOptions = {
      type: 'info' as const,
      buttons: ['Restart', 'Later'],
      title: 'Application Update',
      message: process.platform === 'win32' ? releaseNotes : releaseName,
      detail:
        'A new version has been downloaded. Restart the application to apply the updates.',
    };

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall();
    });
  }
);

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...\n');
});

autoUpdater.on('update-available', () => {
  console.log('New update available!\n');
});

autoUpdater.on('update-not-available', () => {
  console.log('Up to date!\n');
});

autoUpdater.on('before-quit-for-update', () => {
  console.log('Application update is about to begin...\n');
});

autoUpdater.on('error', (message) => {
  console.error('There was a problem updating the application');
  console.error(message, '\n');
});
