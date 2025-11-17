import { Injectable } from '@nestjs/common';
import path from 'path';
import {
  BibleBook,
  BibleBookShort,
  BibleChapter,
  BibleChapterSection,
  BibleChapterShort,
  BibleSearchDto,
  BibleTranslate,
  BibleTranslateShort,
  BOOK_NAMES,
} from '@lyri-cast/entities';
import fs from 'fs';

@Injectable()
export class BibleByFilesService {
  assetsPath = path.resolve(process.cwd(), 'assets', 'complete-jsons', 'bibles');
  assetsPathNew = '';

  biblesCache: Record<string, BibleTranslate> = {};

  isReady = false;

  readedTranslates = false;
  constructor() {
    this.assetsPathNew = path.resolve(
      process.env?.['assetsPath'] ?? '',
      'complete-jsons',
      'bibles'
    );
    console.log('assetsPathNew', this.assetsPathNew);
  } // private readonly bibleTranslateRepo: Repository<BibleTranslateEntity> // @InjectRepository(BibleTranslateEntity)

  getAllBibles(): BibleTranslate[] {
    const allBibles = this.getAllShortBibles();

    return allBibles.map((el) => this.biblesCache[el.keyForSearch]);
  }

  getAllShortBibles(): BibleTranslateShort[] {
    if (this.readedTranslates) {
      return Object.keys(this.biblesCache).map((key) => this.biblesCache[key]);
    }
    const translatesFiles = fs.readdirSync(this.assetsPathNew);
    const translates: BibleTranslateShort[] = [];

    try {
      for (const translateFile of translatesFiles) {
        if (this.biblesCache[translateFile]) {
          translates.push(this.biblesCache[translateFile]);
          console.log('in cache');
          continue;
        }

        const translateStr = fs.readFileSync(
          path.resolve(this.assetsPathNew, translateFile)
        );
        const translate: BibleTranslate = JSON.parse(translateStr.toString());

        translates.push({
          title: translate.title,
          sourceTitle: translate.sourceTitle,
          keyForSearch: translate.keyForSearch,
          lang: translate.lang,
          version: translate.version,
          isDefault: false,
          isClassicBookOrder: translate.isClassicBookOrder,
        });
        this.biblesCache[translate.keyForSearch] = translate;
      }

      this.readedTranslates = true;
      return translates;
    } catch (error) {
      console.log('getAllBibles', error);
      return [];
    }
  }

  getBooks(key: string): BibleBook[] {
    const translate = this.getAllBibles().find((el) => el.keyForSearch === key);
    if (!translate) {
      return [];
    }

    return translate.books.map((book) => {
      const bookName = book.title ?? BOOK_NAMES[book.number];
      return {
        ...book,
        title: bookName ?? book.title,
      };
    });
  }

  getBooksShort(key: string): BibleBookShort[] {
    return this.getBooks(key).map(
      (el) =>
        ({
          ...el,
          chapters: el.chapters.map(
            (chapter) =>
              ({
                title: chapter.title,
                number: chapter.number,
              } satisfies BibleChapterShort)
          ),
        } satisfies BibleBookShort)
    ) satisfies BibleBookShort[];
  }

  getChaptersInBook(translate: string, bookId: number): BibleChapter[] {
    const books = this.getBooks(translate);

    return (
      books.find((el) => String(el.number) === String(bookId))?.chapters ?? []
    );
  }

  getChapterSections(
    translate: string,
    bookId: number,
    chapterId: number
  ): BibleChapterSection[] {
    const chapters = this.getChaptersInBook(translate, bookId).find(
      (el) => String(el.number) === String(chapterId)
    );

    return chapters?.subsections || [];
  }

  searchInContent(
    translate: string,
    search: string,
    bookId?: number,
    chapterId?: number
  ) {
    // ===== helpers =====
    const escapeRegExp = (s: string) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const normalize = (s: string) =>
      (s ?? '')
        .replace(/\u00A0/g, ' ') // NBSP -> space
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()«»"'“”„]/g, ' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    // Собираем секцию в одну строку + карту индексов -> какой content и локальный offset
    function buildSectionIndex(section: any) {
      const parts: {
        idxStart: number;
        idxEnd: number;
        contentIndex: number;
        localStart: number;
      }[] = [];
      let combined = '';
      let cursor = 0;

      (section.content ?? []).forEach((c: any, i: number) => {
        const raw = c.text || '';
        const norm = normalize(raw);
        const start = cursor;
        combined += (combined ? ' ' : '') + norm;
        const end = combined.length; // после добавления
        parts.push({
          idxStart: start + (combined ? 1 : 0), // с учётом добавленного пробела между кусками
          idxEnd: end,
          contentIndex: i,
          localStart: 0, // используем ниже
        });
        cursor = end;
      });

      return { combined, parts };
    }

    // По глобальному regex находим все попадания (start,end)
    function findAll(
      re: RegExp,
      text: string
    ): Array<{ start: number; end: number }> {
      const res: Array<{ start: number; end: number }> = [];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const start = m.index;
        const end = start + (m[0]?.length ?? 0);
        res.push({ start, end });
        if (re.lastIndex === m.index) re.lastIndex++; // защита от пустых матчей
      }
      return res;
    }

    // Маппинг глобального индекса секции -> индекс контента
    function mapToContent(
      pos: number,
      parts: ReturnType<typeof buildSectionIndex>['parts']
    ) {
      // бинарный поиск можно, но частей обычно не так много
      for (const p of parts) {
        if (pos >= p.idxStart && pos <= p.idxEnd) return p.contentIndex;
      }
      return 0;
    }

    const result: BibleSearchDto = { search, sections: [] };
    const books = this.getBooks(translate).filter((b) =>
      bookId ? b.number === bookId : true
    );

    const normalizedSearch = normalize(search);
    const terms = normalizedSearch.split(' ').filter(Boolean);
    if (terms.length === 0) return result;

    // Фраза “как в блокноте”: слова через \s+, без \b, unicode+ignoreCase+global
    const phraseRe = new RegExp(
      terms.map((t) => escapeRegExp(t)).join('\\s+'),
      'igu'
    );

    // Отдельные слова (для скоринга)
    const termRes = terms.map(
      (t) => new RegExp(`(?:^|\\s)${escapeRegExp(t)}(?:\\s|$)`, 'igu')
    );

    type Match = {
      bookId: number;
      chapterId: number;
      content: any;
      score: number;
    };
    const matches: Match[] = [];

    for (const book of books) {
      for (const chapter of book.chapters) {
        if (chapterId && chapter.number !== chapterId) continue;

        for (const section of chapter.subsections) {
          const { combined, parts } = buildSectionIndex(section);
          if (!combined) continue;

          // 1) Фразовые совпадения по всей секции
          const hits = findAll(phraseRe, combined);
          for (const h of hits) {
            const contentIdx = mapToContent(h.start, parts);
            const content = section.content[contentIdx];

            // Базовый скоринг за фразу
            let score = terms.length * 3;

            // 2) +добавим очки за отдельные слова в рамках всей секции,
            //    чтобы отдавать приоритет “насыщенным” местам
            for (const tr of termRes) {
              score += (combined.match(tr) || []).length;
            }

            matches.push({
              bookId: book.number,
              chapterId: chapter.number,
              content,
              score,
            });
          }

          // 3) Если фразы нет вообще, но есть отдельные слова — тоже добавим результаты
          if (hits.length === 0) {
            // для каждого content посчитаем локальные матчи
            (section.content ?? []).forEach((c: any) => {
              const nt = normalize(c.text || '');
              let score = 0;
              for (const tr of termRes) score += (nt.match(tr) || []).length;
              if (score > 0) {
                matches.push({
                  bookId: book.number,
                  chapterId: chapter.number,
                  content: c,
                  score,
                });
              }
            });
          }
        }
      }
    }

    // ВАЖНО: больше НЕ режем “по одной записи на главу”.
    // Группируем только одинаковые (bookId,chapterId,contentId) чтобы не дублировать один и тот же content из-за нескольких попаданий фразы внутри него.
    const key = (m: Match) =>
      `${m.bookId}#${m.chapterId}#${
        (m.content && (m.content.id ?? m.content.verse ?? m.content.key)) ??
        JSON.stringify(m.content)
      }`;

    const dedupMap = new Map<string, Match>();
    for (const m of matches) {
      const k = key(m);
      const prev = dedupMap.get(k);
      dedupMap.set(k, !prev || m.score > prev.score ? m : prev);
    }

    const finalMatches = Array.from(dedupMap.values()).sort(
      (a, b) => b.score - a.score
    );

    result.sections = finalMatches.map((m) => {
      const foundBook = books.find(
        (b) => String(b.number) === String(m.bookId)
      );
      const bookShortName = foundBook?.title?.short ?? m.bookId;
      return {
        bookId: m.bookId,
        bookShortName: String(bookShortName),
        chapterId: m.chapterId,
        content: m.content, // оригинал
      };
    });
    ////////////////// fesf es
    return result;
  }
}
