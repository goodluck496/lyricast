import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DB_PROVIDER_TOKEN } from './db/database.provider';
import * as schema from './db/schema';
import {
  SaveSongDisplaySettingsDto,
  SongDisplaySettingsDto,
  SongIdentityDto,
  SongUsageSummaryDto,
  StartSongUsageSessionDto,
  SONG_APPEARANCE_SCHEMA_VERSION,
} from './song-usage-domain.types';

const MIN_USAGE_DURATION_MS = 3000;

@Injectable()
export class SongUsageDomainService {
  constructor(
    @Inject(DB_PROVIDER_TOKEN)
    private readonly db: BetterSQLite3Database<typeof schema>
  ) {}

  startSession(dto: StartSongUsageSessionDto): { id: string } {
    const id = randomUUID();
    const now = new Date();

    this.db.insert(schema.songUsageEvents).values({
      id,
      songBookKey: dto.songBookKey,
      songNumber: dto.songNumber,
      songTitle: dto.songTitle ?? '',
      startedAt: now,
      splitPartsCount: dto.splitPartsCount ?? null,
      appearanceSchemaVersion:
        dto.appearanceSchemaVersion ?? SONG_APPEARANCE_SCHEMA_VERSION,
      appearanceSnapshot: dto.appearanceSnapshot
        ? JSON.stringify(dto.appearanceSnapshot)
        : '',
    }).run();

    return { id };
  }

  finishSession(id: string, endedAt = new Date()): { id: string; durationMs: number } {
    const event = this.db
      .select()
      .from(schema.songUsageEvents)
      .where(eq(schema.songUsageEvents.id, id))
      .get();

    if (!event) {
      throw new NotFoundException(`Song usage session ${id} not found`);
    }

    const durationMs = Math.max(0, endedAt.getTime() - event.startedAt.getTime());
    const countedDurationMs =
      durationMs >= MIN_USAGE_DURATION_MS ? durationMs : null;

    this.db
      .update(schema.songUsageEvents)
      .set({
        endedAt,
        durationMs: countedDurationMs,
      })
      .where(eq(schema.songUsageEvents.id, id))
      .run();

    return { id, durationMs };
  }

  saveSettings(dto: SaveSongDisplaySettingsDto): SongDisplaySettingsDto {
    const now = new Date();
    const songKey = this.getSongKey(dto);
    const row = {
      songKey,
      songBookKey: dto.songBookKey,
      songNumber: dto.songNumber,
      appearanceSchemaVersion: dto.appearanceSchemaVersion,
      appearanceJson: JSON.stringify(dto.appearance),
      splitPartsCount: dto.splitPartsCount ?? null,
      updatedAt: now,
    };

    this.db
      .insert(schema.songDisplaySettings)
      .values(row)
      .onConflictDoUpdate({
        target: schema.songDisplaySettings.songKey,
        set: row,
      })
      .run();

    return this.mapSettings(row);
  }

  getSettings(identity: SongIdentityDto): SongDisplaySettingsDto | null {
    const row = this.db
      .select()
      .from(schema.songDisplaySettings)
      .where(eq(schema.songDisplaySettings.songKey, this.getSongKey(identity)))
      .get();

    return row ? this.mapSettings(row) : null;
  }

  getSummaries(): SongUsageSummaryDto[] {
    const rows = this.db
      .select({
        songBookKey: schema.songUsageEvents.songBookKey,
        songNumber: schema.songUsageEvents.songNumber,
        songTitle: schema.songUsageEvents.songTitle,
        useCount: sql<number>`count(*)`,
        lastUsedAt: sql<number | null>`max(${schema.songUsageEvents.startedAt})`,
      })
      .from(schema.songUsageEvents)
      .where(isNotNull(schema.songUsageEvents.durationMs))
      .groupBy(
        schema.songUsageEvents.songBookKey,
        schema.songUsageEvents.songNumber,
        schema.songUsageEvents.songTitle
      )
      .orderBy(desc(sql`max(${schema.songUsageEvents.startedAt})`))
      .all();

    return rows.map((row) => {
      const durations = this.getDurations(row.songBookKey, row.songNumber);
      return {
        songBookKey: row.songBookKey,
        songNumber: row.songNumber,
        songTitle: row.songTitle,
        useCount: Number(row.useCount),
        lastUsedAt: this.toIsoString(row.lastUsedAt),
        medianDurationMs: this.getMedian(durations),
      };
    });
  }

  getSummary(identity: SongIdentityDto): SongUsageSummaryDto | null {
    const row = this.db
      .select({
        songBookKey: schema.songUsageEvents.songBookKey,
        songNumber: schema.songUsageEvents.songNumber,
        songTitle: schema.songUsageEvents.songTitle,
        useCount: sql<number>`count(*)`,
        lastUsedAt: sql<number | null>`max(${schema.songUsageEvents.startedAt})`,
      })
      .from(schema.songUsageEvents)
      .where(
        and(
          eq(schema.songUsageEvents.songBookKey, identity.songBookKey),
          eq(schema.songUsageEvents.songNumber, identity.songNumber),
          isNotNull(schema.songUsageEvents.durationMs)
        )
      )
      .groupBy(
        schema.songUsageEvents.songBookKey,
        schema.songUsageEvents.songNumber,
        schema.songUsageEvents.songTitle
      )
      .get();

    if (!row) {
      return null;
    }

    return {
      songBookKey: row.songBookKey,
      songNumber: row.songNumber,
      songTitle: row.songTitle,
      useCount: Number(row.useCount),
      lastUsedAt: this.toIsoString(row.lastUsedAt),
      medianDurationMs: this.getMedian(
        this.getDurations(row.songBookKey, row.songNumber)
      ),
    };
  }

  private getDurations(songBookKey: string, songNumber: number): number[] {
    return this.db
      .select({ durationMs: schema.songUsageEvents.durationMs })
      .from(schema.songUsageEvents)
      .where(
        and(
          eq(schema.songUsageEvents.songBookKey, songBookKey),
          eq(schema.songUsageEvents.songNumber, songNumber),
          isNotNull(schema.songUsageEvents.durationMs)
        )
      )
      .all()
      .map((row) => row.durationMs)
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => a - b);
  }

  private getMedian(values: number[]): number | null {
    if (!values.length) {
      return null;
    }

    const middle = Math.floor(values.length / 2);
    if (values.length % 2 === 1) {
      return values[middle];
    }

    return Math.round((values[middle - 1] + values[middle]) / 2);
  }

  private toIsoString(value: number | string | Date | null): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const timestamp = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
    return new Date(timestampMs).toISOString();
  }

  private getSongKey(identity: SongIdentityDto): string {
    return `${identity.songBookKey}:${identity.songNumber}`;
  }

  private mapSettings(row: schema.SongDisplaySettings): SongDisplaySettingsDto {
    return {
      songBookKey: row.songBookKey,
      songNumber: row.songNumber,
      appearanceSchemaVersion: row.appearanceSchemaVersion,
      appearance: this.parseJson(row.appearanceJson),
      splitPartsCount: row.splitPartsCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
