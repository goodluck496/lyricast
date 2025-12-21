import { inject, Injectable } from '@angular/core';
import {
  BibleBookShort,
  BibleChapterShort,
  BibleTranslateShort,
} from '@lyri-cast/entities';
import { BibleApiService } from '@lyri-cast/data-access-bible';
import { BehaviorSubject, take } from 'rxjs';

export type BibleQuickRefSuggestion = {
  label: string;
  meta?: string;
  path: string[];
};

type Context = {
  query: string;
  books: BibleBookShort[];
  translate: BibleTranslateShort | null;
  active: boolean;
};

@Injectable()
export class BibleQuickReferenceService {
  private readonly bibleApiSrv = inject(BibleApiService);

  private readonly maxVerseCache = new Map<string, number>();
  private readonly maxVerseLoading = new Set<string>();

  private readonly context: Context = {
    query: '',
    books: [],
    translate: null,
    active: false,
  };

  private readonly suggestionsSubject = new BehaviorSubject<BibleQuickRefSuggestion[]>([]);
  readonly suggestions$ = this.suggestionsSubject.asObservable();

  updateContext(ctx: Partial<Context>): void {
    Object.assign(this.context, ctx);
    this.recompute();
  }

  private normalizeBookKey(value: string): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/\u00A0/g, ' ')
      .replace(/[\s.,”"'`’()\[\]{}]+/g, '')
      .replace(/[\-–—:]+/g, '')
      .trim();
  }

  private normalizeBookKeyForMatch(value: string): string {
    const key = this.normalizeBookKey(value);
    const withoutOrdinal = key.replace(/^(\d+)(ое|ая|я|ый|ий|е)/u, '$1');

    return withoutOrdinal
      .replace(/^от/u, '')
      .replace(/книга/gu, '')
      .replace(/послание/gu, '')
      .trim();
  }

  private buildBookMatchKeys(book: BibleBookShort): string[] {
    const baseKeys = [book.title?.short ?? '', book.title?.full ?? '']
      .map((v) => this.normalizeBookKeyForMatch(v))
      .filter(Boolean);

    const withoutLeadingNumber = baseKeys
      .map((k) => k.replace(/^\d+/u, ''))
      .filter(Boolean);

    return Array.from(new Set([...baseKeys, ...withoutLeadingNumber]));
  }

  private scoreMatch(bookKey: string, keys: string[]): number {
    let bestScore = 0;
    for (const k of keys) {
      if (!k) continue;
      if (k === bookKey) bestScore = Math.max(bestScore, 4);
      else if (k.startsWith(bookKey)) bestScore = Math.max(bestScore, 3);
      else if (bookKey.startsWith(k)) bestScore = Math.max(bestScore, 2);
      else if (k.includes(bookKey)) bestScore = Math.max(bestScore, 1);
    }
    return bestScore;
  }

  private cacheKey(bookId: number, chapterId: number): string {
    return `${this.context.translate?.keyForSearch ?? 'no-translate'}#${bookId}#${chapterId}`;
  }

  private ensureMaxVerse(book: BibleBookShort, chapterId: number): void {
    const translate = this.context.translate;
    if (!translate) return;

    const key = this.cacheKey(book.number, chapterId);
    if (this.maxVerseCache.has(key) || this.maxVerseLoading.has(key)) return;

    this.maxVerseLoading.add(key);

    const chapterShort: BibleChapterShort = {
      number: chapterId,
      title: String(chapterId),
    };

    this.bibleApiSrv
      .getSections(translate, book, chapterShort)
      .pipe(take(1))
      .subscribe({
        next: (sections) => {
          const max = Math.max(
            1,
            ...sections
              .flatMap((s) => s.content ?? [])
              .map((v) => v.number)
              .filter((n) => Number.isFinite(n))
          );
          this.maxVerseCache.set(key, max);
          this.maxVerseLoading.delete(key);
          this.recompute();
        },
        error: () => {
          this.maxVerseLoading.delete(key);
        },
      });
  }

  private buildBookOnlySuggestions(bookPartRaw: string): BibleQuickRefSuggestion[] {
    const bookKey = this.normalizeBookKeyForMatch(bookPartRaw);
    if (!bookKey) return [];

    const matches = (this.context.books ?? [])
      .map((b) => {
        const score = this.scoreMatch(bookKey, this.buildBookMatchKeys(b));
        if (!score) return null;

        const maxChapter = Math.max(
          1,
          ...(b.chapters ?? []).map((c) => c.number).filter((n) => Number.isFinite(n))
        );

        return {
          label: `${b.title?.full ?? b.title?.short ?? ''}`,
          meta: `главы 1–${maxChapter}`,
          path: [String(b.number), '1', '1'],
          score,
        };
      })
      .filter(Boolean) as Array<{
        label: string;
        meta: string;
        path: string[];
        score: number;
      }>;

    const unique = new Map<string, { label: string; meta: string; path: string[]; score: number }>();
    for (const m of matches) {
      const k = m.path.join('#');
      const prev = unique.get(k);
      unique.set(k, !prev || m.score > prev.score ? m : prev);
    }

    return Array.from(unique.values())
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 10)
      .map(({ label, meta, path }) => ({ label, meta, path }));
  }

  private buildChapterSuggestions(
    bookPart: string,
    chapter: number,
    verse: number | undefined
  ): BibleQuickRefSuggestion[] {
    const bookKey = this.normalizeBookKeyForMatch(bookPart);
    if (!bookKey) return [];

    const candidates = (this.context.books ?? [])
      .map((b) => {
        const score = this.scoreMatch(bookKey, this.buildBookMatchKeys(b));
        if (!score) return null;

        const chapterExists = (b.chapters ?? []).some((c) => c.number === chapter);
        if (!chapterExists) return null;

        const maxVerse = this.maxVerseCache.get(this.cacheKey(b.number, chapter));
        if (maxVerse === undefined) {
          this.ensureMaxVerse(b, chapter);
        }

        if (verse && maxVerse !== undefined && verse > maxVerse) {
          return null;
        }

        const bookLabel = b.title?.full ?? b.title?.short ?? '';
        const label = verse ? `${bookLabel} ${chapter}:${verse}` : `${bookLabel} ${chapter}`;
        const meta = verse
          ? maxVerse !== undefined
            ? `стих ${verse} из ${maxVerse}`
            : `стих ${verse}`
          : maxVerse !== undefined
            ? `стихи 1–${maxVerse}`
            : `стихи 1–…`;

        const path = [String(b.number), String(chapter), String(verse ?? 1)];

        return { label, meta, path, score };
      })
      .filter(Boolean) as Array<{ label: string; meta: string; path: string[]; score: number }>;

    const unique = new Map<string, { label: string; meta: string; path: string[]; score: number }>();
    for (const c of candidates) {
      const k = c.path.join('#');
      const prev = unique.get(k);
      unique.set(k, !prev || c.score > prev.score ? c : prev);
    }

    return Array.from(unique.values())
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 10)
      .map(({ label, meta, path }) => ({ label, meta, path }));
  }

  private recompute(): void {
    const { query, active } = this.context;
    if (!active) {
      this.suggestionsSubject.next([]);
      return;
    }

    const value = (query ?? '').replace(/\u00A0/g, ' ').trim();
    if (!value) {
      this.suggestionsSubject.next([]);
      return;
    }

    const allNumberMatches = Array.from(value.matchAll(/\d+/g));
    if (!allNumberMatches.length) {
      this.suggestionsSubject.next(this.buildBookOnlySuggestions(value));
      return;
    }

    const startsWithNumber = allNumberMatches[0]?.index === 0;
    const afterFirstNumberIdx = (allNumberMatches[0]?.index ?? 0) + (allNumberMatches[0]?.[0]?.length ?? 0);
    const hasLetterAfterFirstNumber = startsWithNumber
      ? /[\p{L}]/u.test(value.slice(afterFirstNumberIdx, afterFirstNumberIdx + 1))
      : false;

    const chapterMatch = startsWithNumber && hasLetterAfterFirstNumber ? allNumberMatches[1] : allNumberMatches[0];
    if (!chapterMatch || chapterMatch.index === undefined) {
      this.suggestionsSubject.next([]);
      return;
    }

    const bookPart = value.slice(0, chapterMatch.index).trim();
    if (!bookPart) {
      this.suggestionsSubject.next([]);
      return;
    }

    const numbers = value
      .slice(chapterMatch.index)
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (!numbers.length) {
      this.suggestionsSubject.next(this.buildBookOnlySuggestions(bookPart));
      return;
    }

    const chapter = numbers[0];
    const verse = numbers[1];

    this.suggestionsSubject.next(this.buildChapterSuggestions(bookPart, chapter, verse));
  }
}
