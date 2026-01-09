import { Injectable, inject } from '@angular/core';
import { debounceTime, finalize, Observable, tap } from 'rxjs';

import { ISong, Lyric, LyricLine, LyricTypeEnum } from '@lyri-cast/entities';
import { SongsDictionaryApiService } from '@lyri-cast/data-access-dictionaries';

@Injectable()
export class SongEditorSidebarFacade {
  private api = inject(SongsDictionaryApiService);

  dbId: string | null = null;

  songId: string | null = null;
  song: ISong | null = null;

  isNew = false;
  isLoading = false;
  isSaving = false;

  // значение активной панели аккордеона (uniqId куплета)
  activeLyricValue: string | null = null;

  LyricTypeEnum = LyricTypeEnum;

  lyricTypeOptions = [
    { label: 'Куплет', value: LyricTypeEnum.COUPLET },
    { label: 'Припев', value: LyricTypeEnum.CHORUS },
  ];

  load(
    dbId: string,
    songId: string | null,
    nextNumber?: number | null,
    bookFileKey?: string | null
  ): void {
    this.dbId = dbId;
    this.songId = songId;

    this.activeLyricValue = null;

    if (songId == null) {
      this.isNew = true;
      this.isLoading = false;
      this.song = this.api.createEmptySong();
      this.song.bookName.fileKey = bookFileKey || dbId;
      this.song.number = nextNumber && nextNumber > 0 ? nextNumber : 1;
      if (!this.song.lyrics) {
        this.song.lyrics = [];
      }
      return;
    }

    this.isNew = false;
    this.isLoading = true;
    this.song = null;

    this.api.getSong(dbId, String(songId)).subscribe((fullSong) => {
      if (fullSong.lyrics) {
        fullSong.lyrics = fullSong.lyrics.map((l) => ({
          ...l,
          type: (l.type || LyricTypeEnum.COUPLET) as LyricTypeEnum,
        }));
      }

      this.song = fullSong;
      this.isLoading = false;

      // по умолчанию открываем первый куплет, если он есть
      this.activeLyricValue =
        fullSong.lyrics && fullSong.lyrics.length > 0 ? fullSong.lyrics[0].uniqId : null;
    });
  }

  save(): Observable<unknown> {
    if (!this.song || !this.dbId) {
      throw new Error('SongEditorSidebarFacade.save: song or dbId is missing');
    }

    if (!this.song.bookName?.fileKey) {
      this.song.bookName = {
        ...(this.song.bookName || { humanName: '' }),
        fileKey: this.dbId,
      };
    }

    this.isSaving = true;
    return this.api.saveSong(this.dbId, this.song).pipe(
      tap((res) => {
        if (res?.id) {
          this.songId = String(res.id);
          if (this.song) {
            this.song.id = res.id;
          }
          this.isNew = false;
        }
      }),
      debounceTime(300),
      finalize(() => (this.isSaving = false))
    );
  }

  linesToText(lines: LyricLine[] | null | undefined): string {
    if (!lines || lines.length === 0) {
      return '';
    }

    return lines.map((line) => line.text ?? '').join('\n');
  }

  updateLyricLinesFromText(lyric: Lyric, value: string): void {
    const parts = value.split(/\r?\n/);

    const newLines: LyricLine[] = parts.map((text, index) => {
      const existing = lyric.lines?.[index];

      return {
        id: existing?.id,
        rangeIndex: `${index}-${index}`,
        index,
        globalSongIndex: index,
        text,
      };
    });

    lyric.lines = newLines;
  }

  setLyricType(lyric: Lyric, type: LyricTypeEnum): void {
    if (!this.song || !this.song.lyrics) {
      lyric.type = type;
      return;
    }

    if (type === LyricTypeEnum.CHORUS) {
      // припев может быть только один: делаем выбранный блок припевом,
      // все остальные сбрасываем в куплеты
      // upd пока отменил это, чтоб не испортить справочники
      this.song.lyrics = this.song.lyrics.map((l) => {
        if (l === lyric) {
          return { ...l, type: LyricTypeEnum.CHORUS };
        }

        // if (l.type === LyricTypeEnum.CHORUS) {
        //   return { ...l, type: LyricTypeEnum.COUPLET };
        // }

        return l;
      });
    } else {
      // если ставим куплет, просто обновляем тип у текущего блока
      this.song.lyrics = this.song.lyrics.map((l) =>
        l === lyric ? { ...l, type: LyricTypeEnum.COUPLET } : l
      );
    }
  }

  addLyric(): void {
    if (!this.song) return;

    if (!this.song.lyrics) {
      this.song.lyrics = [];
    }

    const newLyric: Lyric = {
      songId: '',
      uniqId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sectionTitle: `Куплет ${this.song.lyrics.length + 1}`,
      type: LyricTypeEnum.COUPLET,
      splitLinesCount: 1,
      lines: [
        {
          id: undefined,
          rangeIndex: '0-0',
          index: 0,
          globalSongIndex: 0,
          text: '',
        },
      ],
    };

    this.song.lyrics = [...this.song.lyrics, newLyric];
  }
}
