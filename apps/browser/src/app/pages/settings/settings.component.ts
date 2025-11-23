import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService, WindowService } from '@lyri-cast/common-browser';
import { AppDisplay } from '@lyri-cast/common-electron';
import { CardModule } from 'primeng/card';
import { ButtonDirective } from 'primeng/button';
import { Observable } from 'rxjs';
import { DividerModule } from 'primeng/divider';
import { AssetManagementComponent } from '@lyri-cast/asset-management';
import { TabsModule } from 'primeng/tabs';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';

@Component({
  selector: 'lyri-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonDirective,
    DividerModule,
    AssetManagementComponent,
    TabsModule,
    ToggleButtonModule,
    SelectModule,
    FloatLabelModule,
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

  /**
   * Appearance settings
   */
  availableFonts: string[] = [
    'sans-serif',
    'Font-1',
    'Font-2',
    'Font-3',
    'Font-4',
    'Font-5',
  ];
  fontOptions = this.availableFonts.map((font) => ({
    label: font,
    value: font,
  }));
  selectedFont = 'sans-serif';
  isDarkTheme = true;

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

    // Initialize appearance settings from localStorage or current DOM
    try {
      const storedTheme = localStorage.getItem('lyricast.theme');
      if (storedTheme === 'dark' || storedTheme === 'light') {
        this.isDarkTheme = storedTheme === 'dark';
      }

      const storedFont = localStorage.getItem('lyricast.font');
      if (storedFont && this.availableFonts.includes(storedFont)) {
        this.selectedFont = storedFont;
      }
    } catch {
      // localStorage may be unavailable in some environments; fall back to DOM detection
    }

    const html = document.documentElement;
    if (typeof this.isDarkTheme !== 'boolean') {
      this.isDarkTheme = html.classList.contains('my-app-dark');
    }

    if (!this.selectedFont) {
      const currentFont = getComputedStyle(document.body).fontFamily || '';
      const normalizedFont = currentFont.toLowerCase();
      if (normalizedFont.includes('cruinn')) {
        this.selectedFont = 'Cruinn';
      } else if (normalizedFont.includes('entropia')) {
        this.selectedFont = 'Entropia';
      } else if (normalizedFont.includes('share-tech-cyr')) {
        this.selectedFont = 'Share-Tech-CYR';
      } else {
        this.selectedFont = 'sans-serif';
      }
    }

    // Apply detected or stored theme and font so UI is in sync immediately
    this.onThemeToggle(this.isDarkTheme);
    this.onFontChange(this.selectedFont);

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

  onThemeToggle(isDark: boolean) {
    this.isDarkTheme = isDark;
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('my-app-dark');
    } else {
      html.classList.remove('my-app-dark');
    }
    try {
      localStorage.setItem('lyricast.theme', isDark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
    this.cdr.detectChanges();
  }

  onFontChange(font: string | { label: string; value: string }) {
    const value = typeof font === 'string' ? font : font?.value;
    this.selectedFont = value;
    if (value === 'sans-serif') {
      document.body.style.fontFamily = 'sans-serif';
    } else {
      document.body.style.fontFamily = `"${value}", sans-serif`;
    }
    try {
      localStorage.setItem('lyricast.font', value);
    } catch {
      // ignore storage errors
    }
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    // В текущей реализации нет removeListener, но если добавите — используйте здесь
    console.log('destroy settings component');
  }
}
