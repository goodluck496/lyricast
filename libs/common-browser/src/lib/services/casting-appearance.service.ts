import { Injectable, signal, WritableSignal } from '@angular/core';

export interface CastingAppearance {
  fontFamily: string;
  minFontSize: number;
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
  private readonly appearances: Record<
    CastingAppearanceScope,
    WritableSignal<CastingAppearance>
  > = {
    songs: signal<CastingAppearance>(this.load('songs')),
    bible: signal<CastingAppearance>(this.load('bible')),
  };

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
    try {
      const raw =
        localStorage.getItem(this.getStorageKey(scope)) ??
        (scope === 'songs' ? localStorage.getItem(STORAGE_KEY) : null);
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
    try {
      localStorage.setItem(this.getStorageKey(scope), JSON.stringify(appearance));
    } catch {
      return;
    }
  }

  private getStorageKey(scope: CastingAppearanceScope): string {
    return `${SCOPED_STORAGE_KEY_PREFIX}${scope}`;
  }

  private normalize(appearance: CastingAppearance): CastingAppearance {
    return {
      ...appearance,
      minFontSize: this.clampNumber(appearance.minFontSize, 8, 140),
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

  private isAppearanceRecord(value: unknown): value is CastingAppearance {
    return typeof value === 'object' && value !== null;
  }
}
