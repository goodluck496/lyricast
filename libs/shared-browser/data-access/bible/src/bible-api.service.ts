import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BibleBook,
  BibleBookShort,
  BibleChapter,
  BibleChapterSection,
  BibleChapterShort,
  BibleSearchDto,
  BibleTranslateShort,
} from '@lyri-cast/entities';
import { Observable } from 'rxjs';
import { BridgeService } from '@lyri-cast/common-browser';

@Injectable({ providedIn: 'root' })
export class BibleApiService {
  //нужно переделать токен, чтобы была фабрика которая возвращает url зависимо от модуля
  // можно сделать на сигналах
  BASE_API_TOKEN = 'svc://bible'; //inject(BASE_API_TOKEN);
  API_BIBLE_TOKEN = '';

  bridge = inject(BridgeService);

  http = inject(HttpClient);

  getLanguages(): Observable<string[]> {
    return this.http.get<string[]>(`${this.BASE_API_TOKEN}/languages`);
  }

  getTranslates(): Observable<BibleTranslateShort[]> {
    const searchParams = new HttpParams({
      fromObject: {
        short: true,
      },
    });

    return this.http.get<BibleTranslateShort[]>(
      `${this.BASE_API_TOKEN}/translates`,
      {
        params: searchParams,
      }
    );
  }

  getBooks(
    translate: BibleTranslateShort,
    short = true
  ): Observable<Array<BibleBook | BibleBookShort>> {
    const searchParams = new HttpParams({
      fromObject: {
        short,
      },
    });

    return this.http.get<Array<BibleBook | BibleBookShort>>(
      [this.BASE_API_TOKEN, 'books', translate.keyForSearch].join('/'),
      {
        params: searchParams,
      }
    );
  }

  getBookChapters(
    translate: BibleTranslateShort,
    book: BibleBookShort
  ): Observable<BibleChapter[]> {
    return this.http.get<BibleChapter[]>(
      [
        this.BASE_API_TOKEN,
        'chapters',
        translate.keyForSearch,
        book.number,
      ].join('/')
    );
  }

  getSections(
    translate: BibleTranslateShort,
    book: BibleBookShort,
    chapter: BibleChapterShort
  ): Observable<BibleChapterSection[]> {
    return this.http.get<BibleChapterSection[]>(
      [
        this.BASE_API_TOKEN,
        'chapter',
        translate.keyForSearch,
        book.number,
        chapter.number,
      ].join('/')
    );
  }

  search(
    translate: BibleTranslateShort,
    searchParams: {
      query: string;
      book?: number;
      chapter?: number;
    }
  ): Observable<BibleSearchDto> {
    const params = new HttpParams({
      fromObject: searchParams,
    });

    return this.http.get<BibleSearchDto>(
      [this.BASE_API_TOKEN, 'search', translate.keyForSearch].join('/'),
      {
        params,
      }
    );
  }
}
