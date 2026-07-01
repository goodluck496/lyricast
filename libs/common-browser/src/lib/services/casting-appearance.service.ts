import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { WindowService } from './window.service';

export interface CastingAppearance {
  fontFamily: string;
  minFontSize: number;
  maxFontSize: number;
  fontWeight: '400' | '700';
  textColor: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  backgroundColor: string;
  backgroundAssetId: string | null;
  backgroundImageUrl: string | null;
}

export const CASTING_APPEARANCE_UPDATE_EVENT = 'updateCastingAppearance';
export type CastingAppearanceScope = 'songs' | 'bible';

export const DEFAULT_CASTING_APPEARANCE: CastingAppearance = {
  fontFamily: 'sans-serif',
  minFontSize: 28,
  maxFontSize: 140,
  fontWeight: '700',
  textColor: '#ffdd00',
  shadowColor: '#000000',
  shadowBlur: 4,
  shadowOffsetX: 1,
  shadowOffsetY: 1,
  backgroundColor: '#1a1a1a',
  backgroundAssetId: null,
  backgroundImageUrl: null,
};

const STORAGE_KEY = 'lyricast.castingAppearance';
const SCOPED_STORAGE_KEY_PREFIX = 'lyricast.castingAppearance.';

@Injectable({ providedIn: 'root' })
export class CastingAppearanceService {
  private readonly windowSrv = inject(WindowService);
  private readonly appearances: Record<
    CastingAppearanceScope,
    WritableSignal<CastingAppearance>
  > = {
    // Синхронная инициализация из localStorage для мгновенного старта
    songs: signal<CastingAppearance>(DEFAULT_CASTING_APPEARANCE),
    bible: signal<CastingAppearance>(this.load('bible')),
  };

  // При наличии Electron догоним фактические значения из файлового хранилища
  constructor() {
    this.hydrateBibleFromElectronSettings();
  }

  readonly appearance = this.appearances.songs;

  appearanceFor(scope: CastingAppearanceScope): WritableSignal<CastingAppearance> {
    return this.appearances[scope];
  }

  update(
    patch: Partial<CastingAppearance>,
    scope: CastingAppearanceScope = 'songs'
  ): CastingAppearance {
    const appearance = this.appearanceFor(scope);
    const next = this.normalize({ ...appearance(), ...patch });
    appearance.set(next);
    this.save(next, scope);
    return next;
  }

  set(appearance: CastingAppearance, scope: CastingAppearanceScope = 'songs'): void {
    const next = this.normalize(appearance);
    this.appearanceFor(scope).set(next);
    this.save(next, scope);
  }

  resetBackground(scope: CastingAppearanceScope = 'songs'): CastingAppearance {
    return this.update(
      {
        backgroundAssetId: null,
        backgroundImageUrl: null,
      },
      scope
    );
  }

  getTextStyles(appearance = this.appearance()): Record<string, string> {
    const shadow = `${appearance.shadowOffsetX}px ${appearance.shadowOffsetY}px ${appearance.shadowBlur}px ${appearance.shadowColor}`;

    return {
      'font-family': appearance.fontFamily,
      'font-weight': appearance.fontWeight,
      color: appearance.textColor,
      'text-shadow': shadow,
      '--bible-verse-number-color': this.getVerseNumberColor(appearance),
    };
  }

  getReferenceStyles(appearance = this.appearance()): Record<string, string> {
    const shadow = `${appearance.shadowOffsetX}px ${appearance.shadowOffsetY}px ${appearance.shadowBlur}px ${appearance.shadowColor}`;

    return {
      color: this.getVerseNumberColor(appearance),
      'text-shadow': shadow,
    };
  }

  getBackgroundStyles(appearance = this.appearance()): Record<string, string> {
    const styles: Record<string, string> = {
      'background-color': appearance.backgroundColor,
      '--casting-background-color': appearance.backgroundColor,
    };

    if (!appearance.backgroundImageUrl) {
      return styles;
    }

    return {
      ...styles,
      'background-image': `url("${appearance.backgroundImageUrl}")`,
      'background-size': 'cover',
      'background-position': 'center',
      'background-repeat': 'no-repeat',
    };
  }

  private load(scope: CastingAppearanceScope): CastingAppearance {
    if (scope === 'songs') {
      return DEFAULT_CASTING_APPEARANCE;
    }

    try {
      const raw =
        localStorage.getItem(this.getStorageKey(scope)) ??
        localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return DEFAULT_CASTING_APPEARANCE;
      }

      const parsed: unknown = JSON.parse(raw);
      if (!this.isAppearanceRecord(parsed)) {
        return DEFAULT_CASTING_APPEARANCE;
      }

      return this.normalize({
        ...DEFAULT_CASTING_APPEARANCE,
        ...parsed,
      });
    } catch {
      return DEFAULT_CASTING_APPEARANCE;
    }
  }

  private save(
    appearance: CastingAppearance,
    scope: CastingAppearanceScope
  ): void {
    if (scope === 'songs') {
      return;
    }

    try {
      // Браузерный fallback (нужен для dev и если Electron недоступен)
      localStorage.setItem(this.getStorageKey(scope), JSON.stringify(appearance));

      // Persist в файловое хранилище Electron, чтобы настройки не зависели от origin/порта
      if (this.windowSrv.hasElectron) {
        // Выполняем без ожидания (fire-and-forget), т.к. это сервис UI
        (async () => {
          try {
            const electron = this.windowSrv.electronContext;
            const settings: any = (await electron.loadUserSettings()) ?? {};
            const current = settings.castingAppearance || {};
            const updated = {
              ...settings,
              castingAppearance: {
                ...current,
                [scope]: appearance,
              },
            };
            await electron.saveUserSettings(updated);
          } catch (error) {
            console.warn(
              `[CastingAppearanceService] Failed to save [scope:${scope}] appearance settings`,
              error
            );
          }
        })();
      }
    } catch {
      return;
    }
  }

  private getStorageKey(scope: CastingAppearanceScope): string {
    return `${SCOPED_STORAGE_KEY_PREFIX}${scope}`;
  }

  private normalize(appearance: CastingAppearance): CastingAppearance {
    const minFontSize = this.clampNumber(appearance.minFontSize, 8, 140);
    const maxFontSize = this.clampNumber(
      Math.max(appearance.maxFontSize, minFontSize),
      8,
      200
    );

    return {
      ...appearance,
      minFontSize,
      maxFontSize,
      shadowBlur: this.clampNumber(appearance.shadowBlur, 0, 40),
      shadowOffsetX: this.clampNumber(appearance.shadowOffsetX, -40, 40),
      shadowOffsetY: this.clampNumber(appearance.shadowOffsetY, -40, 40),
      fontWeight: appearance.fontWeight === '400' ? '400' : '700',
      textColor: this.normalizeColor(appearance.textColor, '#ffdd00'),
      shadowColor: this.normalizeColor(appearance.shadowColor, '#000000'),
      backgroundColor: this.normalizeColor(appearance.backgroundColor, '#1a1a1a'),
      backgroundAssetId: appearance.backgroundAssetId || null,
      backgroundImageUrl: appearance.backgroundImageUrl || null,
    };
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(max, Math.max(min, Math.round(value)));
  }

  private normalizeColor(value: string, fallback: string): string {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  private getVerseNumberColor(appearance: CastingAppearance): string {
    const textColor = this.parseHexColor(appearance.textColor);
    const backgroundColor = this.parseHexColor(appearance.backgroundColor);
    if (!textColor || !backgroundColor) {
      return '#ffffff';
    }

    const backgroundIsDark = this.getRelativeLuminance(backgroundColor) < 0.45;
    const candidates = (
      backgroundIsDark
        ? ['#ffffff', '#ffdd00', '#38bdf8', '#f97316']
        : ['#111111', '#1f2937', '#0f766e', '#7c2d12']
    )
      .map((color) => {
        const rgb = this.parseHexColor(color);
        if (!rgb) {
          return null;
        }

        return {
          color,
          textDistance: this.getColorDistance(rgb, textColor),
          backgroundContrast: this.getContrastRatio(rgb, backgroundColor),
        };
      })
      .filter((candidate) => candidate !== null);

    const distinctCandidates = candidates
      .filter((candidate) => candidate.textDistance >= 90)
      .sort((a, b) => {
        const contrastDiff = b.backgroundContrast - a.backgroundContrast;
        return contrastDiff || b.textDistance - a.textDistance;
      });

    return distinctCandidates[0]?.color ?? this.invertColor(appearance.textColor);
  }

  private parseHexColor(
    value: string
  ): { red: number; green: number; blue: number } | null {
    if (!/^#[0-9a-f]{6}$/i.test(value)) {
      return null;
    }

    return {
      red: Number.parseInt(value.slice(1, 3), 16),
      green: Number.parseInt(value.slice(3, 5), 16),
      blue: Number.parseInt(value.slice(5, 7), 16),
    };
  }

  private getColorDistance(
    first: { red: number; green: number; blue: number },
    second: { red: number; green: number; blue: number }
  ): number {
    const red = first.red - second.red;
    const green = first.green - second.green;
    const blue = first.blue - second.blue;

    return Math.sqrt(red * red + green * green + blue * blue);
  }

  private getContrastRatio(
    first: { red: number; green: number; blue: number },
    second: { red: number; green: number; blue: number }
  ): number {
    const firstLuminance = this.getRelativeLuminance(first);
    const secondLuminance = this.getRelativeLuminance(second);
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);

    return (lighter + 0.05) / (darker + 0.05);
  }

  private getRelativeLuminance({
    red,
    green,
    blue,
  }: {
    red: number;
    green: number;
    blue: number;
  }): number {
    const r = this.getLinearColorChannel(red);
    const g = this.getLinearColorChannel(green);
    const b = this.getLinearColorChannel(blue);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  private getLinearColorChannel(channel: number): number {
    const normalized = channel / 255;

    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  }

  private invertColor(value: string): string {
    const color = this.parseHexColor(value);
    if (!color) {
      return '#ffffff';
    }

    return `#${(255 - color.red).toString(16).padStart(2, '0')}${(
      255 - color.green
    )
      .toString(16)
      .padStart(2, '0')}${(255 - color.blue).toString(16).padStart(2, '0')}`;
  }

  private isAppearanceRecord(value: unknown): value is CastingAppearance {
    return typeof value === 'object' && value !== null;
  }

  /**
   * Догружает значения из настроек Electron (файловое хранилище) и обновляет сигналы.
   * Обеспечивает миграцию: если в файле пусто, но есть localStorage — записываем в файл.
   */
  private async hydrateBibleFromElectronSettings(): Promise<void> {
    try {
      if (!this.windowSrv.hasElectron) {
        return; // браузерный режим — остаёмся на localStorage
      }

      const electron = this.windowSrv.electronContext;
      const settings: any = (await electron.loadUserSettings()) ?? {};
      const stored = settings.castingAppearance as
        | Partial<Record<CastingAppearanceScope, CastingAppearance>>
        | undefined;

      const localBible = this.appearances.bible();

      const fromFileBible = stored?.bible;

      let needSaveBack = false;

        // синхронизируем и localStorage для совместимости
      if (fromFileBible && this.isAppearanceRecord(fromFileBible)) {
        const next = this.normalize({ ...DEFAULT_CASTING_APPEARANCE, ...fromFileBible });
        this.appearances.bible.set(next);
        localStorage.setItem(this.getStorageKey('bible'), JSON.stringify(next));
      } else if (localBible) {
        needSaveBack = true;
      }

      if (needSaveBack) {
        try {
          const updated = {
            ...settings,
            castingAppearance: {
              ...(settings.castingAppearance ?? {}),
              bible: this.appearances.bible(),
            },
          };
          await electron.saveUserSettings(updated);
        } catch (error) {
          console.warn(
            '[CastingAppearanceService] Failed to migrate bible appearance settings',
            error
          );
        }
      }
    } catch (error) {
      console.warn(
        '[CastingAppearanceService] Failed to hydrate bible appearance settings',
        error
      );
    }
  }
}
