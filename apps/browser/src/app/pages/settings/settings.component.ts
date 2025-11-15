import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsService, WindowService } from '@lyri-cast/common-browser';
import { AppDisplay } from '@lyri-cast/common-electron';
import { CardModule } from 'primeng/card';
import { ButtonDirective } from 'primeng/button';
import { Observable } from 'rxjs';
import { DividerModule } from 'primeng/divider';
import { AssetManagementComponent } from '@lyri-cast/asset-management';
import { NgScrollbar } from 'ngx-scrollbar';
import { TabViewModule } from 'primeng/tabview';

@Component({
  selector: 'lyri-settings',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonDirective,
    DividerModule,
    AssetManagementComponent,
    NgScrollbar,
    TabViewModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit, OnDestroy {
  cdr = inject(ChangeDetectorRef);
  settingsSrv = inject(SettingsService);
  windowSrv = inject(WindowService);

  displays: AppDisplay[] = [];

  selectedDisplay$: Observable<AppDisplay | null> =
    this.settingsSrv.getDisplayForCasting();

  appVersion = '';
  updateInProgress = false;
  updatePercent = 0;
  updateLabel = '';
  private _updateHandler?: (s: any) => void;

  async ngOnInit() {
    const srv = await this.settingsSrv.init();
    this.displays = [...srv.displays];

    // Текущая версия приложения
    try {
      this.appVersion = await this.windowSrv.electronContext.getAppVersion();
    } catch (e: any) {
      console.log('ERROR getAppVersion: ', e.message || e, '');
    }

    // Подписка на статусы обновления приложения
    this._updateHandler = (s: any) => {
      switch (s?.type) {
        case 'initialized':
        case 'checking-for-update':
          this.updateInProgress = true;
          this.updateLabel = 'Проверка обновлений...';
          break;
        case 'update-available':
          this.updateInProgress = true;
          this.updateLabel = `Доступна версия ${s.version}`;
          break;
        case 'download-progress':
          this.updateInProgress = true;
          this.updatePercent = s.percent ?? 0;
          this.updateLabel = `Загрузка: ${this.updatePercent}%`;
          break;
        case 'update-downloaded':
          this.updateInProgress = false;
          this.updatePercent = 100;
          this.updateLabel = 'Обновление скачано';
          break;
        case 'update-not-available':
          this.updateInProgress = false;
          this.updatePercent = 0;
          this.updateLabel = 'Обновлений нет';
          break;
        case 'error':
          this.updateInProgress = false;
          this.updateLabel = 'Ошибка обновления';
          break;
      }
      this.cdr.detectChanges();
    };
    this.windowSrv.electronContext.onAppUpdateStatus(this._updateHandler);

    this.cdr.detectChanges();
  }

  onSelectDisplay(display: AppDisplay) {
    this.settingsSrv.setDisplayForCasting(display);
  }

  onCheckUpdates() {
    this.updateInProgress = true;
    this.updatePercent = 0;
    this.updateLabel = 'Проверка обновлений...';
    this.windowSrv.electronContext.checkForAppUpdates();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    // В текущей реализации нет removeListener, но если добавите — используйте здесь
    console.log('destroy settings component');
  }
}
