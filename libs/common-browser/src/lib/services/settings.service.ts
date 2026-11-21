import { inject, Injectable } from '@angular/core';
import {
  AppDisplay,
  OutputChannelConfig,
  OutputRole,
  OutputTargetType,
} from '@lyri-cast/common-electron';
import { WindowService } from './window.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';

export const DEFAULT_OUTPUT_CHANNELS: OutputChannelConfig[] = [
  {
    id: 'main',
    name: 'Основной зал',
    role: 'main',
    targetType: 'display',
    enabled: true,
    autoStart: true,
  },
  {
    id: 'stage',
    name: 'Суфлер (Сцена)',
    role: 'stage',
    targetType: 'display',
    enabled: false,
    autoStart: false,
  },
  {
    id: 'bible-secondary',
    name: 'Второй перевод Библии',
    role: 'secondary_bible',
    targetType: 'display',
    enabled: false,
    autoStart: false,
  },
  {
    id: 'obs-stream',
    name: 'OBS Стрим (Титры)',
    role: 'lower_third',
    targetType: 'obs_web',
    enabled: false,
    autoStart: false,
  },
];

@Injectable({ providedIn: 'root' })
export class SettingsService {
  winSrv = inject(WindowService);

  displays: AppDisplay[] = [];

  private displayForCasting$ = new BehaviorSubject<AppDisplay | null>(null);
  private channels$ = new BehaviorSubject<OutputChannelConfig[]>([]);
  private emulationMode$ = new BehaviorSubject<boolean>(false);

  private initialized = false;

  public async init() {
    if (this.initialized) {
      return this;
    }

    await this.loadDisplays();
    await this.loadPersistedSettings();
    this.initialized = true;
    return this;
  }

  setDisplayForCasting(display: AppDisplay) {
    this.displayForCasting$.next(display);
    // Also update main channel's displayId
    const channels = this.getChannels();
    const mainChannel = channels.find((c) => c.id === 'main');
    if (mainChannel && mainChannel.displayId !== display.id) {
      this.updateChannel('main', { displayId: display.id });
    }
  }

  getDisplayForCasting(): Observable<AppDisplay> {
    return this.displayForCasting$.asObservable().pipe(filterEmpty());
  }

  getChannels(): OutputChannelConfig[] {
    return this.channels$.getValue();
  }

  getChannelsObservable(): Observable<OutputChannelConfig[]> {
    return this.channels$.asObservable();
  }

  getEmulationMode(): boolean {
    return this.emulationMode$.getValue();
  }

  getEmulationModeObservable(): Observable<boolean> {
    return this.emulationMode$.asObservable();
  }

  async setEmulationMode(enabled: boolean): Promise<void> {
    this.emulationMode$.next(enabled);
    await this.persistSettings();
  }

  async addChannel(channel: OutputChannelConfig): Promise<void> {
    const list = [...this.getChannels(), channel];
    this.channels$.next(list);
    await this.persistSettings();
  }

  async updateChannel(
    id: string,
    patch: Partial<OutputChannelConfig>
  ): Promise<void> {
    const list = this.getChannels().map((c) =>
      c.id === id ? { ...c, ...patch } : c
    );
    this.channels$.next(list);

    // If main channel updated displayId, sync displayForCasting$
    if (id === 'main' && patch.displayId !== undefined) {
      const display = this.displays.find((d) => d.id === patch.displayId);
      if (display) {
        this.displayForCasting$.next(display);
      }
    }

    await this.persistSettings();
  }

  async removeChannel(id: string): Promise<void> {
    if (id === 'main') {
      return; // Cannot remove main hall channel
    }
    const list = this.getChannels().filter((c) => c.id !== id);
    this.channels$.next(list);
    await this.persistSettings();
  }

  getDisplayById(displayId?: number): AppDisplay | undefined {
    if (displayId === undefined) return undefined;
    return this.displays.find((d) => d.id === displayId);
  }

  getActiveChannels(): OutputChannelConfig[] {
    return this.getChannels().filter((c) => c.enabled);
  }

  private async loadDisplays(): Promise<AppDisplay[]> {
    try {
      const displays: AppDisplay[] = await this.winSrv.electronContext.getDisplays();
      this.displays = displays || [];

      if (this.displays.length === 1) {
        this.displayForCasting$.next(this.displays[0]);
      } else {
        const secondary = this.displays.find((el) => !el.primary);
        this.displayForCasting$.next(secondary || this.displays[0]);
      }

      return this.displays;
    } catch {
      this.displays = [];
      return [];
    }
  }

  private async loadPersistedSettings(): Promise<void> {
    let saved: any = null;
    try {
      saved = await this.winSrv.electronContext.loadUserSettings();
    } catch {
      saved = null;
    }

    if (!saved && typeof localStorage !== 'undefined') {
      try {
        const local = localStorage.getItem('lyricast.channelSettings');
        if (local) {
          saved = JSON.parse(local);
        }
      } catch {}
    }

    const defaultDisplay = this.displayForCasting$.getValue();

    if (saved && Array.isArray(saved.outputChannels) && saved.outputChannels.length > 0) {
      this.channels$.next(saved.outputChannels);
    } else {
      // Initialize defaults
      const defaults = DEFAULT_OUTPUT_CHANNELS.map((ch) => {
        if (ch.id === 'main' && defaultDisplay) {
          return { ...ch, displayId: defaultDisplay.id };
        }
        return { ...ch };
      });
      this.channels$.next(defaults);
    }

    if (saved && typeof saved.emulationMode === 'boolean') {
      this.emulationMode$.next(saved.emulationMode);
    }
  }

  private async persistSettings(): Promise<void> {
    const payload = {
      outputChannels: this.getChannels(),
      emulationMode: this.getEmulationMode(),
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          'lyricast.channelSettings',
          JSON.stringify(payload)
        );
      } catch {}
    }

    try {
      const existing =
        (await this.winSrv.electronContext.loadUserSettings()) || {};
      await this.winSrv.electronContext.saveUserSettings({
        ...existing,
        ...payload,
      });
    } catch {
      // ignore persistence error
    }
  }
}
