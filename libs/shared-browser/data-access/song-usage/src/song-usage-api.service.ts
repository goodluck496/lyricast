import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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

export interface SongOverrideDto extends SongIdentityDto {
  songKey: string;
  lyrics: unknown[];
  updatedAt: string;
}

export interface SaveSongOverrideDto extends SongIdentityDto {
  lyrics: unknown[];
}

@Injectable({ providedIn: 'root' })
export class SongUsageApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'svc://song-usage';

  startSession(payload: StartSongUsageSessionDto): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.baseUrl}/sessions`, payload);
  }

  finishSession(id: string): Observable<{ id: string; durationMs: number }> {
    return this.http.post<{ id: string; durationMs: number }>(
      `${this.baseUrl}/sessions/${id}/finish`,
      {}
    );
  }

  getSummaries(): Observable<SongUsageSummaryDto[]> {
    return this.http.get<SongUsageSummaryDto[]>(`${this.baseUrl}/summaries`);
  }

  getSummary(identity: SongIdentityDto): Observable<SongUsageSummaryDto | null> {
    return this.http.get<SongUsageSummaryDto | null>(`${this.baseUrl}/summary`, {
      params: this.getIdentityParams(identity),
    });
  }

  getSettings(identity: SongIdentityDto): Observable<SongDisplaySettingsDto | null> {
    return this.http.get<SongDisplaySettingsDto | null>(`${this.baseUrl}/settings`, {
      params: this.getIdentityParams(identity),
    });
  }

  saveSettings(
    payload: SaveSongDisplaySettingsDto
  ): Observable<SongDisplaySettingsDto> {
    return this.http.post<SongDisplaySettingsDto>(
      `${this.baseUrl}/settings`,
      payload
    );
  }

  getOverride(identity: SongIdentityDto): Observable<SongOverrideDto | null> {
    return this.http.get<SongOverrideDto | null>(`${this.baseUrl}/override`, {
      params: this.getIdentityParams(identity),
    });
  }

  saveOverride(payload: SaveSongOverrideDto): Observable<SongOverrideDto> {
    return this.http.post<SongOverrideDto>(`${this.baseUrl}/override`, payload);
  }

  deleteOverride(identity: SongIdentityDto): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/override`, {
      params: this.getIdentityParams(identity),
    });
  }

  getBookOverrides(songBookKey: string): Observable<number[]> {
    return this.http.get<number[]>(`${this.baseUrl}/overrides`, {
      params: new HttpParams({ fromObject: { songBookKey } }),
    });
  }

  private getIdentityParams(identity: SongIdentityDto): HttpParams {
    return new HttpParams({
      fromObject: {
        songBookKey: identity.songBookKey,
        songNumber: String(identity.songNumber),
      },
    });
  }
}
