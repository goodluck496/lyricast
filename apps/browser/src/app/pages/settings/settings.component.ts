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
import { RouteReuseStrategy } from '@angular/router';
import {
  SettingsService,
  UserSettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { AppDisplay } from '@lyri-cast/common-electron';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Observable } from 'rxjs';
import { DividerModule } from 'primeng/divider';
import { AssetManagementComponent } from '@lyri-cast/asset-management';
import { TabsModule } from 'primeng/tabs';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { SnowfallManager } from '../../../services/common/snowfall.service';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { SongsApiService, SongDictionaryCardDto } from '@lyri-cast/data-access-songs';
import { firstValueFrom } from 'rxjs';
import { AccordionModule } from 'primeng/accordion';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ConfirmationService } from 'primeng/api';
import { BadgeModule } from 'primeng/badge';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Pages } from '@lyri-cast/common-browser';
import { CustomReuseStrategy } from '../../../services/common/router-reuse.strategy';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { Card } from 'primeng/card';

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
    AccordionModule,
    ConfirmPopup,
    BadgeModule,
    ProgressSpinnerModule,
    ButtonLabel,
    ButtonIcon,
    SongDictionaryCardComponent,
    Card,
  ],
  providers: [ConfirmationService],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit, OnDestroy {
  cdr = inject(ChangeDetectorRef);
  settingsSrv = inject(SettingsService);
  windowSrv = inject(WindowService);
  userSettings = inject(UserSettingsService);
  snowfall = inject(SnowfallManager);
  songsApi = inject(SongsApiService);
  confirmationService = inject(ConfirmationService);
  routeReuse = inject(RouteReuseStrategy);

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
  snowEnabled = false;

  songDictionaries: SongDictionaryCardDto[] = [];
  songDictionariesLoading = false;
  songDictionaryBusyByKey: Record<string, boolean> = {};
  songDictionariesClearBusy = false;

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

    // Apply detected or stored theme and font so UI is in sync immediately
    this.onThemeToggle(this.isDarkTheme);
    this.onFontChange(this.selectedFont);

    // Snowfall settings
    this.snowEnabled = this.snowfall.isEnabled();

    this.cdr.detectChanges();

    await this.reloadSongDictionaries();
  }

  toSongDatabaseInfo(card: SongDictionaryCardDto): SongDatabaseInfoDto {
    // Used only for unified card rendering
    return {
      db: card.fileKey,
      title: card.title,
      language: card.language,
      coverImage: card.coverImage,
      sizeBytes: card.sizeBytes,
      songCount: card.songCount,
      version: card.remoteVersion ?? card.localVersion,
      updatedAt: card.updatedAt,
      updatedBy: card.updatedBy,
    };
  }

  async reloadSongDictionaries(): Promise<void> {
    this.songDictionariesLoading = true;
    this.cdr.detectChanges();
    try {
      this.songDictionaries = await firstValueFrom(
        this.songsApi.getSongDictionaries()
      );
    } catch (e) {
      console.log('Failed to load song dictionaries', e);
      this.songDictionaries = [];
    } finally {
      this.songDictionariesLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async deleteDictionary(card: SongDictionaryCardDto): Promise<void> {
    this.songDictionaryBusyByKey[card.fileKey] = true;
    this.cdr.detectChanges();
    try {
      await firstValueFrom(
        this.songsApi.deleteSongDictionary({
          fileKey: card.fileKey,
        })
      );

      if (this.routeReuse instanceof CustomReuseStrategy) {
        this.routeReuse.clearByPathContains(Pages.SONGS);
      }

      await this.reloadSongDictionaries();
    } catch (e) {
      console.log('Failed to delete dictionary', e);
    } finally {
      this.songDictionaryBusyByKey[card.fileKey] = false;
      this.cdr.detectChanges();
    }
  }

  private async clearSongDictionaries(): Promise<void> {
    this.songDictionariesClearBusy = true;
    this.cdr.detectChanges();
    try {
      await firstValueFrom(this.songsApi.clearSongDictionaries());

      if (this.routeReuse instanceof CustomReuseStrategy) {
        this.routeReuse.clearByPathContains(Pages.SONGS);
      }

      await this.reloadSongDictionaries();
    } catch (e) {
      console.log('Failed to clear dictionaries', e);
    } finally {
      this.songDictionariesClearBusy = false;
      this.cdr.detectChanges();
    }
  }

  onReloadSongDictionaries(event?: Event): void {
    event?.stopPropagation();
    void this.reloadSongDictionaries();
  }

  onClearSongDictionaries(event: Event): void {
    event.stopPropagation();

    this.confirmationService.confirm({
      target: event.target as any,
      message:
        'Удалить все скачанные справочники?<br>Встроенные справочники удалены не будут.',
      rejectLabel: 'Нет',
      acceptLabel: 'Да',
      rejectButtonProps: { severity: 'secondary' },
      acceptButtonProps: { severity: 'danger' },
      accept: () => {
        void this.clearSongDictionaries();
      },
    });
  }

  onDeleteDictionary(event: Event, card: SongDictionaryCardDto): void {
    event.stopPropagation();
    this.confirmationService.confirm({
      target: event.target as any,
      message: `Удалить справочник "${card.title}"?`,
      acceptLabel: 'Да',
      rejectLabel: 'Нет',
      rejectButtonProps: { severity: 'secondary' },
      acceptButtonProps: { severity: 'danger' },
      accept: () => {
        void this.deleteDictionary(card);
      },
    });
  }

  onInstallOrUpdateDictionary(event: Event, card: SongDictionaryCardDto): void {
    const actionLabel = card.isInstalled ? 'обновить' : 'установить';
    this.confirmationService.confirm({
      target: event.target as any,
      message: `Вы уверены, что хотите ${actionLabel} справочник? <br> Загрузка может занять некоторое время.`,
      acceptLabel: 'Да',
      rejectLabel: 'Нет',
      rejectButtonProps: { severity: 'secondary' },
      acceptButtonProps: { severity: 'danger' },
      accept: () => {
        void this.installOrUpdateDictionary(card);
      },
    });
  }

  private async installOrUpdateDictionary(
    card: SongDictionaryCardDto
  ): Promise<void> {
    this.songDictionaryBusyByKey[card.fileKey] = true;
    this.cdr.detectChanges();
    try {
      await firstValueFrom(
        this.songsApi.installSongDictionary({
          fileKey: card.fileKey,
        })
      );

      if (this.routeReuse instanceof CustomReuseStrategy) {
        this.routeReuse.clearByPathContains(Pages.SONGS);
      }

      await this.reloadSongDictionaries();
    } catch (e) {
      console.log('Failed to install dictionary', e);
    } finally {
      this.songDictionaryBusyByKey[card.fileKey] = false;
      this.cdr.detectChanges();
    }
  }

  onSnowToggle(enabled: boolean) {
    this.snowEnabled = enabled;
    this.snowfall.setEnabled(enabled);
    this.userSettings.saveAppearanceSnapshot({
      theme: this.isDarkTheme ? 'dark' : 'light',
      font: this.selectedFont,
      snowEnabled: this.snowEnabled,
    });
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
    this.userSettings.saveAppearanceSnapshot({
      theme: this.isDarkTheme ? 'dark' : 'light',
      font: this.selectedFont,
      snowEnabled: this.snowEnabled,
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
    });
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    // В текущей реализации нет removeListener, но если добавите — используйте здесь
    console.log('destroy settings component');
  }
}
