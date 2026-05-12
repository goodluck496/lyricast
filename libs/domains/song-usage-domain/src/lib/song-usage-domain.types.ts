export const SONG_APPEARANCE_SCHEMA_VERSION = 1;

export interface SongIdentityDto {
  songBookKey: string;
  songNumber: number;
  songTitle?: string;
}

export interface StartSongUsageSessionDto extends SongIdentityDto {
  splitPartsCount?: number | null;
  appearanceSchemaVersion?: number;
  appearanceSnapshot?: unknown;
}

export interface FinishSongUsageSessionDto {
  endedAt?: string;
}

export interface SaveSongDisplaySettingsDto extends SongIdentityDto {
  appearanceSchemaVersion: number;
  appearance: unknown;
  splitPartsCount?: number | null;
}

export interface SongUsageSummaryDto extends SongIdentityDto {
  useCount: number;
  lastUsedAt: string | null;
  medianDurationMs: number | null;
}

export interface SongDisplaySettingsDto extends SongIdentityDto {
  appearanceSchemaVersion: number;
  appearance: unknown;
  splitPartsCount: number | null;
  updatedAt: string;
}
