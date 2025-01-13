import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import {
  BibleBook,
  BibleBookShort,
  BibleChapter,
  BibleChapterSection, BibleChapterShort,
  BibleSearchDto,
  BibleTranslateShort
} from '@lyri-cast/entities';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BibleApiService {
  BASE_API_TOKEN = inject(BASE_API_TOKEN);
  API_BIBLE_TOKEN = 'bible';

  http = inject(HttpClient);

  getLanguages(): Observable<string[]> {
    return this.http.get<string[]>(
      `${this.BASE_API_TOKEN}/${this.API_BIBLE_TOKEN}/languages`
    );
  }

  getTranslates(): Observable<BibleTranslateShort[]> {
    const searchParams = new HttpParams({
      fromObject: {
        short: true,
      },
    });

    return this.http.get<BibleTranslateShort[]>(
      `${this.BASE_API_TOKEN}/${this.API_BIBLE_TOKEN}/translates`,
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
      [
        this.BASE_API_TOKEN,
        this.API_BIBLE_TOKEN,
        'books',
        translate.keyForSearch,
      ].join('/'),
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
        this.API_BIBLE_TOKEN,
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
        this.API_BIBLE_TOKEN,
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
      text: string;
      book?: number;
      chapter?: number;
    }
  ): Observable<BibleSearchDto> {
    const params = new HttpParams({
      fromObject: searchParams,
    });

    return this.http.get<BibleSearchDto>(
      [
        this.BASE_API_TOKEN,
        this.API_BIBLE_TOKEN,
        'search',
        translate.keyForSearch,
      ].join('/'),
      {
        params,
      }
    );
  }
}
