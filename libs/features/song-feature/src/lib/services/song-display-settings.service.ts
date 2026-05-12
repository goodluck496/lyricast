import { inject, Injectable } from '@angular/core';
import {
  CastingAppearance,
  DEFAULT_CASTING_APPEARANCE,
} from '@lyri-cast/common-browser';
import { ISong } from '@lyri-cast/entities';
import {
  SaveSongDisplaySettingsDto,
  SONG_APPEARANCE_SCHEMA_VERSION,
  SongDisplaySettingsDto,
  SongIdentityDto,
  SongUsageApiService,
} from '@lyri-cast/data-access-song-usage';
import { map, Observable, of } from 'rxjs';

export interface SongDisplaySettingsSnapshot {
  appearance: CastingAppearance;
  splitPartsCount: number | null;
}

@Injectable({ providedIn: 'root' })
export class SongDisplaySettingsService {
  private readonly api = inject(SongUsageApiService);

  save(
    song: ISong,
    appearance: CastingAppearance,
    splitPartsCount: number | null
  ): Observable<SongDisplaySettingsDto> {
    const payload: SaveSongDisplaySettingsDto = {
      ...this.getIdentity(song),
      appearanceSchemaVersion: SONG_APPEARANCE_SCHEMA_VERSION,
      appearance,
      splitPartsCount,
    };

    return this.api.saveSettings(payload);
  }

  restore(song: ISong): Observable<SongDisplaySettingsSnapshot | null> {
    return this.api.getSettings(this.getIdentity(song)).pipe(
      map((settings) => {
        if (!settings) {
          return null;
        }

        if (settings.appearanceSchemaVersion !== SONG_APPEARANCE_SCHEMA_VERSION) {
          return null;
        }

        if (!this.isCastingAppearance(settings.appearance)) {
          return null;
        }

        return {
          appearance: this.normalizeAppearance(settings.appearance),
          splitPartsCount: settings.splitPartsCount,
        };
      })
    );
  }

  emptyRestore(): Observable<SongDisplaySettingsSnapshot | null> {
    return of(null);
  }

  getIdentity(song: ISong): SongIdentityDto {
    return {
      songBookKey: song.bookName.fileKey,
      songNumber: song.number,
      songTitle: song.title,
    };
  }

  private normalizeAppearance(appearance: CastingAppearance): CastingAppearance {
    return {
      ...DEFAULT_CASTING_APPEARANCE,
      ...appearance,
      fontWeight: appearance.fontWeight === '400' ? '400' : '700',
      backgroundAssetId: appearance.backgroundAssetId || null,
      backgroundImageUrl: appearance.backgroundImageUrl || null,
    };
  }

  private isCastingAppearance(value: unknown): value is CastingAppearance {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value['fontFamily'] === 'string' &&
      typeof value['minFontSize'] === 'number' &&
      (value['fontWeight'] === '400' || value['fontWeight'] === '700') &&
      this.isHexColor(value['textColor']) &&
      this.isHexColor(value['shadowColor']) &&
      typeof value['shadowBlur'] === 'number' &&
      typeof value['shadowOffsetX'] === 'number' &&
      typeof value['shadowOffsetY'] === 'number' &&
      this.isHexColor(value['backgroundColor']) &&
      this.isNullableString(value['backgroundAssetId']) &&
      this.isNullableString(value['backgroundImageUrl'])
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isNullableString(value: unknown): boolean {
    return value === null || typeof value === 'string';
  }

  private isHexColor(value: unknown): boolean {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  }
}
