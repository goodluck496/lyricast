import { inject, Injectable, signal } from '@angular/core';
import { WindowService } from './window.service';

export interface AppUpdateStatusPayload {
  type:
    | 'initialized'
    | 'checking-for-update'
    | 'update-available'
    | 'download-progress'
    | 'update-downloaded'
    | 'update-not-available'
    | 'error';
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly winSrv = inject(WindowService);

  readonly isDownloading = signal(false);
  readonly downloadPercent = signal(0);
  readonly isUpdateDownloaded = signal(false);
  readonly updateVersion = signal<string | null>(null);
  readonly statusLabel = signal<string>('Проверить обновления');
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.init();
  }

  private init() {
    const electron = this.winSrv.electronContext;

    // Check if there is an existing update status already recorded by Electron
    electron.getAppUpdateStatus?.().then((status: AppUpdateStatusPayload | null) => {
      if (status) {
        this.handleStatus(status);
      }
    });

    electron.onAppUpdateStatus((status: AppUpdateStatusPayload) => {
      this.handleStatus(status);
    });
  }

  handleStatus(status: AppUpdateStatusPayload) {
    if (!status?.type) return;

    switch (status.type) {
      case 'initialized':
      case 'checking-for-update':
        this.isDownloading.set(true);
        this.errorMessage.set(null);
        this.statusLabel.set('Проверка обновлений...');
        break;

      case 'update-available':
        this.isDownloading.set(true);
        this.errorMessage.set(null);
        if (status.version) {
          this.updateVersion.set(status.version);
        }
        this.statusLabel.set(
          status.version ? `Загрузка обновления v${status.version}...` : 'Загрузка обновления...'
        );
        break;

      case 'download-progress': {
        this.isDownloading.set(true);
        this.errorMessage.set(null);
        const pct = status.percent ?? 0;
        this.downloadPercent.set(pct);
        this.statusLabel.set(`Загрузка: ${pct}%`);
        break;
      }

      case 'update-downloaded':
        this.isDownloading.set(false);
        this.isUpdateDownloaded.set(true);
        this.downloadPercent.set(100);
        this.errorMessage.set(null);
        if (status.version) {
          this.updateVersion.set(status.version);
        }
        this.statusLabel.set('Обновление скачано');
        break;

      case 'update-not-available':
        this.isDownloading.set(false);
        this.isUpdateDownloaded.set(false);
        this.downloadPercent.set(0);
        this.errorMessage.set(null);
        this.statusLabel.set('Обновлений нет');
        break;

      case 'error':
        this.isDownloading.set(false);
        this.downloadPercent.set(0);
        this.errorMessage.set(status.message ?? 'Ошибка обновления');
        this.statusLabel.set('Ошибка обновления');
        break;
    }
  }

  checkForUpdates() {
    this.isDownloading.set(true);
    this.statusLabel.set('Проверка обновлений...');
    this.winSrv.electronContext.checkForAppUpdates();
  }

  quitAndInstall() {
    this.winSrv.electronContext.quitAndInstallUpdate?.();
  }
}
