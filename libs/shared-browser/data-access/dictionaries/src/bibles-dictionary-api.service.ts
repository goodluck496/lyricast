import { inject, Injectable } from '@angular/core';
import { HttpClient, type HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  BibleRegistryResponseDto,
  BibleTranslate,
  BibleVersionsCheckRequestDto,
  BibleVersionsCheckResponseDto,
} from '@lyri-cast/entities';
import { DICTIONARIES_API_BASE } from './export-jobs.service';
import { BASE_PATH } from '@lyri-cast/openapi-songs-dictionary';

export interface UpdateBibleMetaDto {
  title?: string;
  humanName?: string;
  sourceTitle?: string;
  language?: string;
  version?: string;
  isDefault?: boolean;
  isClassicBookOrder?: boolean;
}

export interface ImportBibleRequestDto {
  catalogId: number;
  data: BibleTranslate;
}

@Injectable({ providedIn: 'root' })
export class BiblesDictionaryApiService {
  private readonly http = inject(HttpClient);
  private readonly explicitBase = inject(DICTIONARIES_API_BASE, { optional: true });
  private readonly basePathToken = inject(BASE_PATH, { optional: true });

  private resolveBaseUrl(): string {
    if (this.explicitBase) {
      const trimmed = this.explicitBase.replace(/\/+$/, '');
      if (trimmed.endsWith('/songs')) {
        return `${trimmed.slice(0, -6)}/bibles`;
      }
      if (trimmed.endsWith('/api')) {
        return `${trimmed}/bibles`;
      }
      return `${trimmed}/api/bibles`;
    }

    if (this.basePathToken) {
      const trimmed = this.basePathToken.replace(/\/+$/, '');
      return `${trimmed}/api/bibles`;
    }

    return '/api/bibles';
  }

  /**
   * Получение списка переводов Библии из реестра.
   */
  getRegistry(): Observable<BibleRegistryResponseDto> {
    return this.http.get<BibleRegistryResponseDto>(`${this.resolveBaseUrl()}/registry`);
  }

  /**
   * Проверка версий переводов.
   */
  checkVersions(payload: BibleVersionsCheckRequestDto): Observable<BibleVersionsCheckResponseDto> {
    return this.http.post<BibleVersionsCheckResponseDto>(
      `${this.resolveBaseUrl()}/versions/check`,
      payload
    );
  }

  /**
   * Получение структуры перевода (книги и список глав) без стихов.
   */
  getBibleStructure(id: number): Observable<BibleTranslate> {
    return this.http.get<BibleTranslate>(`${this.resolveBaseUrl()}/${id}/structure`);
  }

  /**
   * Получение стихов конкретной главы.
   */
  getChapterVerses(
    bibleId: number,
    chapterId: number
  ): Observable<Array<{ id: number; number: number; text: string }>> {
    return this.http.get<Array<{ id: number; number: number; text: string }>>(
      `${this.resolveBaseUrl()}/${bibleId}/chapters/${chapterId}/verses`
    );
  }

  /**
   * Экспорт полного перевода в JSON формате BibleTranslate.
   */
  getBible(id: number): Observable<BibleTranslate> {
    return this.http.get<BibleTranslate>(`${this.resolveBaseUrl()}/${id}/export`);
  }

  /**
   * Экспорт полного перевода в JSON формате BibleTranslate с отслеживанием прогресса загрузки.
   */
  getBibleWithProgress(id: number): Observable<HttpEvent<BibleTranslate>> {
    return this.http.get<BibleTranslate>(`${this.resolveBaseUrl()}/${id}/export`, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /**
   * Импорт перевода Библии.
   */
  importBible(payload: ImportBibleRequestDto): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.resolveBaseUrl()}/import`, payload);
  }

  /**
   * Импорт перевода Библии с отслеживанием прогресса отправки.
   */
  importBibleWithProgress(payload: ImportBibleRequestDto): Observable<HttpEvent<{ ok: boolean }>> {
    return this.http.post<{ ok: boolean }>(`${this.resolveBaseUrl()}/import`, payload, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /**
   * Обновление метаданных перевода.
   */
  updateMeta(id: number, meta: UpdateBibleMetaDto): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.resolveBaseUrl()}/${id}/meta`, meta);
  }

  /**
   * Обновление текста стиха.
   */
  updateVerse(id: number, verseId: number, text: string): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(
      `${this.resolveBaseUrl()}/${id}/verses/${verseId}`,
      { text }
    );
  }
}
