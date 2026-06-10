import { inject, Injectable } from '@angular/core';
import type { AmbientBackgroundPresetId } from './ambient-background.service';
import { WindowService } from './window.service';

export type UserAppearanceSettings = {
  theme?: 'dark' | 'light';
  font?: string;
  snowEnabled?: boolean;
  ambientBackgroundEnabled?: boolean;
  ambientBackgroundPreset?: AmbientBackgroundPresetId;
};

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private windowSrv = inject(WindowService);

  async loadAndApplyAppearance(): Promise<UserAppearanceSettings | null> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    let loaded: unknown = null;
    try {
      loaded = await this.windowSrv.electronContext.loadUserSettings();
    } catch {
      loaded = null;
    }

    if (!loaded || typeof loaded !== 'object') {
      return null;
    }

    const s = loaded as any;
    const html = document.documentElement;
    const body = document.body;

    const result: UserAppearanceSettings = {};

    try {
      if (s.theme === 'dark' || s.theme === 'light') {
        result.theme = s.theme;
        try {
          localStorage.setItem('lyricast.theme', s.theme);
        } catch {}

        if (s.theme === 'dark') {
          html.classList.add('my-app-dark');
        } else {
          html.classList.remove('my-app-dark');
        }
      }

      if (typeof s.font === 'string' && s.font) {
        result.font = s.font;
        try {
          localStorage.setItem('lyricast.font', s.font);
        } catch {}

        if (s.font === 'sans-serif') {
          body.style.fontFamily = 'sans-serif';
        } else {
          body.style.fontFamily = `"${s.font}", sans-serif`;
        }
      }

      if (typeof s.snowEnabled === 'boolean') {
        result.snowEnabled = s.snowEnabled;
        try {
          localStorage.setItem('lyricast.snow', s.snowEnabled ? 'on' : 'off');
        } catch {}
      }

      if (typeof s.ambientBackgroundEnabled === 'boolean') {
        result.ambientBackgroundEnabled = s.ambientBackgroundEnabled;
        try {
          localStorage.setItem(
            'lyricast.ambient-background',
            s.ambientBackgroundEnabled ? 'on' : 'off'
          );
        } catch {}
      }

      if (
        s.ambientBackgroundPreset === 'aurora' ||
        s.ambientBackgroundPreset === 'lagoon' ||
        s.ambientBackgroundPreset === 'dusk'
      ) {
        result.ambientBackgroundPreset = s.ambientBackgroundPreset;
        try {
          localStorage.setItem(
            'lyricast.ambient-background-preset',
            s.ambientBackgroundPreset
          );
        } catch {}
      }
    } catch {}

    return result;
  }

  async saveAppearanceSnapshot(settings: {
    theme: 'dark' | 'light';
    font: string;
    snowEnabled: boolean;
    ambientBackgroundEnabled: boolean;
    ambientBackgroundPreset: AmbientBackgroundPresetId;
  }): Promise<void> {
    try {
      const existing =
        (await this.windowSrv.electronContext.loadUserSettings()) ?? {};
      await this.windowSrv.electronContext.saveUserSettings({
        ...existing,
        ...settings,
      });
    } catch {
      // ignore persistence errors
    }
  }
}
