import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationStart, RouteReuseStrategy, Router } from '@angular/router';
import {
  AmbientBackgroundManager,
  AmbientBackgroundPresetId,
  AppUpdateService,
  AuthStorageService,
  SettingsService,
  UserSettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import {
  AppDisplay,
  AppWindowTypes,
  OutputChannelConfig,
  OutputRole,
  OutputTargetType,
} from '@lyri-cast/common-electron';
import { ButtonDirective } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';
import { Observable, filter } from 'rxjs';
import { DividerModule } from 'primeng/divider';
import { AssetManagementComponent } from '@lyri-cast/asset-management';
import { TabsModule } from 'primeng/tabs';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SnowfallManager } from '../../../services/common/snowfall.service';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Card } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { SongDictionariesManagerComponent } from '../../components/song-dictionaries-manager/song-dictionaries-manager.component';
import { BibleDictionariesManagerComponent } from '../../components/bible-dictionaries-manager/bible-dictionaries-manager.component';

@Component({
  selector: 'lyri-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonDirective,
    DividerModule,
    AssetManagementComponent,
    TabsModule,
    ToggleButtonModule,
    SelectModule,
    FloatLabelModule,
    ToggleSwitch,
    Card,
    TableModule,
    InputTextModule,
    TagModule,
    TooltipModule,
    SongDictionariesManagerComponent,
    BibleDictionariesManagerComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit, OnDestroy {
  cdr = inject(ChangeDetectorRef);
  destroyRef = inject(DestroyRef);
  settingsSrv = inject(SettingsService);
  windowSrv = inject(WindowService);
  userSettings = inject(UserSettingsService);
  snowfall = inject(SnowfallManager);
  ambientBackground = inject(AmbientBackgroundManager);
  routeReuse = inject(RouteReuseStrategy);
  router = inject(Router);
  confirmSrv = inject(ConfirmationService);
  readonly authStorage = inject(AuthStorageService);
  readonly appUpdateService = inject(AppUpdateService);

  activeTab = 0;
  isLoggingInGoogle = false;
  googleAuthError = '';

  displays: AppDisplay[] = [];
  channels: OutputChannelConfig[] = [];
  emulationMode = false;

  readonly roleOptions = [
    { label: 'Основной зал', value: 'main' as OutputRole },
    { label: 'Суфлер (Сцена)', value: 'stage' as OutputRole },
    { label: '2-й перевод Библии', value: 'secondary_bible' as OutputRole },
    { label: 'OBS Титры / Lower-Third', value: 'lower_third' as OutputRole },
  ];

  readonly targetTypeOptions = [
    { label: 'Физический экран', value: 'display' as OutputTargetType },
    { label: 'Эмуляция (окно)', value: 'emulated' as OutputTargetType },
    { label: 'OBS Web Browser Source', value: 'obs_web' as OutputTargetType },
    { label: 'NDI Network Stream', value: 'ndi' as OutputTargetType },
  ];

  get displaySelectOptions() {
    return this.displays.map((d, index) => ({
      label: `${d.label || 'Экран ' + (index + 1)} (${d.bounds.width}x${d.bounds.height}${d.primary ? ' - Основной' : ''})`,
      value: d.id,
    }));
  }

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
  snowEnabled = false;
  ambientBackgroundEnabled = false;
  ambientBackgroundPreset: AmbientBackgroundPresetId = 'aurora';
  ambientBackgroundPresetOptions = this.ambientBackground.presets.map((preset) => ({
    label: preset.label,
    value: preset.id,
    description: preset.description,
    swatches: preset.swatches,
  }));

  async ngOnInit() {
    this.router.events
      .pipe(
        filter((e): e is NavigationStart => e instanceof NavigationStart),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.confirmSrv.close();
      });

    const srv = await this.settingsSrv.init();
    this.displays = [...srv.displays];
    this.channels = [...srv.getChannels()];
    this.emulationMode = srv.getEmulationMode();

    this.settingsSrv
      .getChannelsObservable()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((channels) => {
        this.channels = [...channels];
        this.cdr.markForCheck();
      });

    this.settingsSrv
      .getEmulationModeObservable()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => {
        this.emulationMode = mode;
        this.cdr.markForCheck();
      });

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

    const loadedSettings = await this.userSettings.loadAndApplyAppearance();
    if (loadedSettings) {
      if (loadedSettings.theme === 'dark' || loadedSettings.theme === 'light') {
        this.isDarkTheme = loadedSettings.theme === 'dark';
      }

      if (
        loadedSettings.font &&
        this.availableFonts.includes(loadedSettings.font)
      ) {
        this.selectedFont = loadedSettings.font;
      }

      if (typeof loadedSettings.snowEnabled === 'boolean') {
        this.snowEnabled = loadedSettings.snowEnabled;
        this.snowfall.setEnabled(this.snowEnabled);
      }

      if (typeof loadedSettings.ambientBackgroundEnabled === 'boolean') {
        this.ambientBackgroundEnabled = loadedSettings.ambientBackgroundEnabled;
        this.ambientBackground.setEnabled(this.ambientBackgroundEnabled);
      }

      if (
        loadedSettings.ambientBackgroundPreset === 'aurora' ||
        loadedSettings.ambientBackgroundPreset === 'lagoon' ||
        loadedSettings.ambientBackgroundPreset === 'dusk'
      ) {
        this.ambientBackgroundPreset = loadedSettings.ambientBackgroundPreset;
        this.ambientBackground.setPreset(this.ambientBackgroundPreset);
      }
    }

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

    // Snowfall settings
    this.snowEnabled = this.snowfall.isEnabled();
    this.ambientBackgroundEnabled = this.ambientBackground.isEnabled();
    this.ambientBackgroundPreset = this.ambientBackground.presetId();

    // Apply detected or stored theme and font so UI is in sync immediately.
    // At this point dependent appearance toggles are already synchronized,
    // so snapshot persistence will not overwrite them with stale defaults.
    this.onThemeToggle(this.isDarkTheme);
    this.onFontChange(this.selectedFont);

    this.cdr.detectChanges();
  }

  onSnowToggle(enabled: boolean) {
    this.snowEnabled = enabled;
    this.snowfall.setEnabled(enabled);
    this.userSettings.saveAppearanceSnapshot({
      theme: this.isDarkTheme ? 'dark' : 'light',
      font: this.selectedFont,
      snowEnabled: this.snowEnabled,
      ambientBackgroundEnabled: this.ambientBackgroundEnabled,
      ambientBackgroundPreset: this.ambientBackgroundPreset,
    });
    this.cdr.detectChanges();
  }

  onAmbientBackgroundToggle(enabled: boolean) {
    this.ambientBackgroundEnabled = enabled;
    this.ambientBackground.setEnabled(enabled);
    this.persistAppearanceSettings();
  }

  onAmbientBackgroundPresetChange(presetId: AmbientBackgroundPresetId) {
    this.ambientBackgroundPreset = presetId;
    this.ambientBackground.setPreset(presetId);
    this.persistAppearanceSettings();
  }

  onSelectDisplay(display: AppDisplay) {
    this.settingsSrv.setDisplayForCasting(display);
  }

  async onToggleEmulationMode(enabled: boolean) {
    this.emulationMode = enabled;
    await this.settingsSrv.setEmulationMode(enabled);
  }

  async onToggleChannel(channel: OutputChannelConfig, enabled: boolean) {
    await this.settingsSrv.updateChannel(channel.id, { enabled });
  }

  async onToggleChannelAutoStart(channel: OutputChannelConfig, autoStart: boolean) {
    await this.settingsSrv.updateChannel(channel.id, { autoStart });
  }

  async onUpdateChannelRole(channel: OutputChannelConfig, role: OutputRole) {
    await this.settingsSrv.updateChannel(channel.id, { role });
  }

  async onUpdateChannelTarget(channel: OutputChannelConfig, targetType: OutputTargetType) {
    await this.settingsSrv.updateChannel(channel.id, { targetType });
  }

  async onUpdateChannelDisplay(channel: OutputChannelConfig, displayId: number) {
    await this.settingsSrv.updateChannel(channel.id, { displayId });
  }

  async onUpdateChannelName(channel: OutputChannelConfig, name: string) {
    await this.settingsSrv.updateChannel(channel.id, { name });
  }

  async onAddChannel() {
    const nextIdx = this.channels.length + 1;
    const newId = `channel-${Date.now().toString(36)}`;
    await this.settingsSrv.addChannel({
      id: newId,
      name: `Экран ${nextIdx}`,
      role: 'stage',
      targetType: 'display',
      displayId: this.displays[0]?.id,
      enabled: true,
      autoStart: false,
    });
  }

  async onDeleteChannel(channel: OutputChannelConfig) {
    await this.settingsSrv.removeChannel(channel.id);
  }

  async onTestChannelWindow(channel: OutputChannelConfig) {
    const display = this.settingsSrv.getDisplayById(channel.displayId) || this.displays[0];
    const emulated = this.emulationMode || channel.targetType === 'emulated';
    await this.windowSrv.electronContext.openWindow({
      type: AppWindowTypes.CASTING,
      title: channel.name,
      channelId: channel.id,
      display,
      emulated,
    });
  }

  async onCloseChannelWindow(channel: OutputChannelConfig) {
    if (this.windowSrv.electronContext.closeCastingWindow) {
      await this.windowSrv.electronContext.closeCastingWindow(channel.id);
    } else {
      await this.windowSrv.electronContext.closeWindow({
        type: AppWindowTypes.CASTING,
        channelId: channel.id,
      });
    }
  }

  onCheckUpdates() {
    this.appUpdateService.checkForUpdates();
  }

  onApplyUpdate() {
    this.appUpdateService.quitAndInstall();
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
    this.userSettings.saveAppearanceSnapshot({
      theme: this.isDarkTheme ? 'dark' : 'light',
      font: this.selectedFont,
      snowEnabled: this.snowEnabled,
      ambientBackgroundEnabled: this.ambientBackgroundEnabled,
      ambientBackgroundPreset: this.ambientBackgroundPreset,
    });
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
    this.userSettings.saveAppearanceSnapshot({
      theme: this.isDarkTheme ? 'dark' : 'light',
      font: this.selectedFont,
      snowEnabled: this.snowEnabled,
      ambientBackgroundEnabled: this.ambientBackgroundEnabled,
      ambientBackgroundPreset: this.ambientBackgroundPreset,
    });
    this.cdr.detectChanges();
  }

  private persistAppearanceSettings() {
    this.userSettings.saveAppearanceSnapshot({
      theme: this.isDarkTheme ? 'dark' : 'light',
      font: this.selectedFont,
      snowEnabled: this.snowEnabled,
      ambientBackgroundEnabled: this.ambientBackgroundEnabled,
      ambientBackgroundPreset: this.ambientBackgroundPreset,
    });
    this.cdr.detectChanges();
  }

  async loginGoogle(): Promise<void> {
    const electron = this.windowSrv.electronContext;
    if (electron?.loginGoogle) {
      this.isLoggingInGoogle = true;
      this.googleAuthError = '';
      this.cdr.detectChanges();
      try {
        const res = await electron.loginGoogle();
        if (res.ok && res.token) {
          await this.authStorage.saveToken(res.token);
          if (res.email) await this.authStorage.saveEmail(res.email);
        } else {
          this.googleAuthError =
            res.error === 'blocked'
              ? 'Пользователь заблокирован администратором'
              : (res.error || 'Ошибка входа через Google');
        }
      } catch (e: unknown) {
        this.googleAuthError = e instanceof Error ? e.message : 'Не удалось выполнить вход';
      } finally {
        this.isLoggingInGoogle = false;
        this.cdr.detectChanges();
      }
    }
  }

  async logout(): Promise<void> {
    await this.authStorage.clearAuth();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    // В текущей реализации нет removeListener, но если добавите — используйте здесь
    console.log('destroy settings component');
  }
}
