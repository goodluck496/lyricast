import { inject, Injectable } from '@angular/core';
import { ISong, Lyric } from '@lyri-cast/entities';
import {
  SaveSongOverrideDto,
  SongOverrideDto,
  SongUsageApiService,
} from '@lyri-cast/data-access-song-usage';
import { map, Observable } from 'rxjs';

function isLyricsArray(value: unknown): value is Lyric[] {
  return Array.isArray(value);
}

@Injectable({ providedIn: 'root' })
export class SongOverrideService {
  private readonly api = inject(SongUsageApiService);

  getOverride(songBookKey: string, songNumber: number): Observable<Lyric[] | null> {
    return this.api.getOverride({ songBookKey, songNumber }).pipe(
      map((dto) => {
        if (!dto || !isLyricsArray(dto.lyrics)) {
          return null;
        }
        return dto.lyrics;
      })
    );
  }

  saveOverride(
    song: ISong,
    lyrics: Lyric[],
    bookKey?: string
  ): Observable<SongOverrideDto> {
    const songBookKey = bookKey || song.bookName?.fileKey;
    if (!songBookKey) {
      throw new Error('songBookKey is missing');
    }
    const payload: SaveSongOverrideDto = {
      songBookKey,
      songNumber: song.number,
      lyrics,
    };
    return this.api.saveOverride(payload);
  }

  deleteOverride(songBookKey: string, songNumber: number): Observable<{ success: boolean }> {
    return this.api.deleteOverride({ songBookKey, songNumber });
  }

  getBookOverrides(songBookKey: string): Observable<number[]> {
    return this.api.getBookOverrides(songBookKey);
  }
}
