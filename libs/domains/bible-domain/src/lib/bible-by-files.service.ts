import { Injectable } from '@nestjs/common';
import path from 'path';
import axios from 'axios';
import {
  BibleBook,
  BibleBookShort,
  BibleChapter,
  BibleChapterSection,
  BibleChapterShort,
  BibleSearchDto,
  BibleTranslate,
  BibleTranslateShort,
  BibleDictionaryCardDto,
  BibleRegistryItemDto,
  BibleRegistryResponseDto,
  BOOK_NAMES,
} from '@lyri-cast/entities';
import fs from 'fs';

@Injectable()
export class BibleByFilesService {
  // Встроенные ассеты в пакете приложения (source)
  assetsPath: string;
  // Внешние ассеты пользователя (USER_ASSETS_PATH в AppData)
  assetsPathNew: string;

  biblesCache: Record<string, BibleTranslate> = {};
  shortTranslatesCache: BibleTranslateShort[] = [];
  isReady = false;

  readedTranslates = false;
  constructor() {
    const sourceAssets =
      process.env?.['assetsPath'] || path.resolve(process.cwd(), 'assets');
    this.assetsPath = path.resolve(sourceAssets, 'complete-jsons', 'bibles');

    const userAssetsRoot = process.env?.['USER_ASSETS_PATH'] || '';
    if (userAssetsRoot) {
      this.assetsPathNew = path.resolve(
        userAssetsRoot,
        'complete-jsons',
        'bibles'
      );
    } else {
      this.assetsPathNew = this.assetsPath;
    }

    // private readonly bibleTranslateRepo: Repository<BibleTranslateEntity> // @InjectRepository(BibleTranslateEntity)
  }

  private getExistingDirs(): string[] {
    const dirs = [this.assetsPathNew, this.assetsPath]
      .filter(Boolean)
      .filter((dir, idx, arr) => arr.indexOf(dir) === idx)
      .filter((dir) => fs.existsSync(dir));
    return dirs;
  }

  // Сброс кэша после изменений (установка/удаление словарей)
  clearCache(): void {
    this.biblesCache = {};
    this.shortTranslatesCache = [];
    this.readedTranslates = false;
  }

  getAllBibles(): BibleTranslate[] {
    const allBibles = this.getAllShortBibles();
    return allBibles
      .map((el) => this.loadBible(el.keyForSearch))
      .filter((b): b is BibleTranslate => !!b);
  }

  getAllShortBibles(): BibleTranslateShort[] {
    if (this.readedTranslates) {
      return this.shortTranslatesCache;
    }
    const translates: BibleTranslateShort[] = [];
    const seenKeys = new Set<string>();

    try {
      const dirs = this.getExistingDirs();

      for (const dir of dirs) {
        const translatesFiles = fs
          .readdirSync(dir)
          .filter((file) => file.toLowerCase().endsWith('.bible.json'));

        for (const translateFile of translatesFiles) {
          const filePath = path.resolve(dir, translateFile);
          const fileContent = fs.readFileSync(filePath, 'utf8');

          const keyForSearchM = fileContent.match(
            /"keyForSearch"\s*:\s*"([^"]+)"/
          );
          const titleM = fileContent.match(/"title"\s*:\s*"([^"]+)"/);
          const sourceTitleM = fileContent.match(
            /"sourceTitle"\s*:\s*"([^"]+)"/
          );
          const langM = fileContent.match(/"lang"\s*:\s*"([^"]+)"/);
          const versionM = fileContent.match(
            /"version"\s*:\s*"?([^",}\s]+)"?/
          );
          const isClassicBookOrderM = fileContent.match(
            /"isClassicBookOrder"\s*:\s*(true|false)/
          );
          const isDefaultM = fileContent.match(
            /"isDefault"\s*:\s*(true|false)/
          );
          const coverImageM = fileContent.match(
            /"coverImage"\s*:\s*"([^"]+)"/
          );

          const key = keyForSearchM ? keyForSearchM[1] : '';
          if (!key) continue;

          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          const isDefault = isDefaultM
            ? isDefaultM[1] === 'true'
            : (key.toLowerCase().includes('rus_synodal') || key.toLowerCase().includes('синодальн'));

          translates.push({
            title: titleM ? titleM[1] : '',
            sourceTitle: sourceTitleM ? sourceTitleM[1] : '',
            keyForSearch: key,
            lang: langM ? langM[1] : 'en',
            version: versionM ? versionM[1] : '',
            isDefault,
            isClassicBookOrder: isClassicBookOrderM
              ? isClassicBookOrderM[1] === 'true'
              : false,
            coverImage: coverImageM ? coverImageM[1] : undefined,
          });
        }
      }

      this.shortTranslatesCache = translates;
      this.readedTranslates = true;
      return translates;
    } catch (error) {
      console.log('getAllShortBibles error', error);
      return [];
    }
  }

  loadBible(key: string): BibleTranslate | null {
    if (this.biblesCache[key]) {
      return this.biblesCache[key];
    }

    try {
      const dirs = this.getExistingDirs();

      for (const dir of dirs) {
        const translatesFiles = fs
          .readdirSync(dir)
          .filter((file) => file.toLowerCase().endsWith('.bible.json'));

        for (const translateFile of translatesFiles) {
          const filePath = path.resolve(dir, translateFile);
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const keyForSearchM = fileContent.match(
            /"keyForSearch"\s*:\s*"([^"]+)"/
          );
          if (keyForSearchM && keyForSearchM[1] === key) {
            const translate: BibleTranslate = JSON.parse(fileContent);
            this.biblesCache[key] = translate;
            return translate;
          }
        }
      }
    } catch (e) {
      console.log('loadBible error', e);
    }
    return null;
  }

  getBooks(key: string): BibleBook[] {
    const translate = this.loadBible(key);
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

  private getRemoteApiUrl(): string {
    const envBase = process.env?.['DICTIONARY_API_URL']?.trim();
    const fallbackBase =
      process.env?.['NODE_ENV'] === 'production'
        ? 'https://lyricast-dictionary-api.onrender.com'
        : 'http://localhost:3000';
    return (envBase || fallbackBase).replace(/\/+$/, '');
  }

  private getAuthHeaders(authHeader?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      headers['Authorization'] = authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`;
      headers['X-Auth-Token'] = token;
      return headers;
    }
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Auth-Token'] = token;
    }
    return headers;
  }

  private getAuthToken(): string | null {
    if (process.env?.['AUTH_TOKEN']) return process.env['AUTH_TOKEN'];

    const candidates = [
      path.join(process.env?.['USER_DATA_PATH'] || '', '..', 'settings.json'),
      path.join(process.env?.['USER_DATA_PATH'] || '', 'settings.json'),
      path.join(process.env?.['APPDATA'] || '', 'LyriCast', 'settings.json'),
      path.join(process.env?.['HOME'] || process.env?.['USERPROFILE'] || '', '.lyricast', 'settings.json'),
    ];

    for (const f of candidates) {
      if (fs.existsSync(f)) {
        try {
          const raw = fs.readFileSync(f, 'utf-8');
          const data = JSON.parse(raw);
          const token = data?.auth?.token;
          if (token) return token;
        } catch {
          // continue
        }
      }
    }
    return null;
  }

  /**
   * Для воркера: получение статуса переводов (локальные файлы vs серверные данные).
   * Возвращает BibleDictionaryCardDto[] для UI менеджера справочников.
   */
  async getDictionariesStatus(authHeader?: string): Promise<BibleDictionaryCardDto[]> {
    const shortBibles = this.getAllShortBibles();
    const localByKey = new Map<string, BibleTranslateShort>();
    for (const b of shortBibles) {
      localByKey.set(b.keyForSearch.toLowerCase().trim(), b);
    }

    const cards: BibleDictionaryCardDto[] = [];
    const processedKeys = new Set<string>();

    // 1. Попытка запросить серверный реестр dictionary-api
    try {
      const remoteUrl = `${this.getRemoteApiUrl()}/api/bibles/registry`;
      const res = await axios.get<BibleRegistryResponseDto>(remoteUrl, {
        headers: this.getAuthHeaders(authHeader),
        timeout: 15000,
      });
      const registryItems = res.data?.items ?? [];

      for (const item of registryItems) {
        const fileKey = item.fileKey;
        const normKey = fileKey.toLowerCase().trim();
        processedKeys.add(normKey);

        const local = localByKey.get(normKey);
        const isInstalled = !!local;
        const remoteVer = item.meta?.version ?? 1;
        const localVer = isInstalled ? (Number(local?.version) || 1) : 0;
        const needsUpdate = isInstalled && remoteVer > localVer;

        let sizeBytes = 0;
        if (isInstalled) {
          const filePath = this.findBibleFilePath(local.keyForSearch);
          if (filePath && fs.existsSync(filePath)) {
            sizeBytes = fs.statSync(filePath).size;
          }
        }

        cards.push({
          fileKey: item.fileKey,
          title: item.meta?.title || item.humanName || item.fileKey,
          language: item.meta?.language || 'ru',
          localVersion: localVer,
          remoteVersion: remoteVer,
          isInstalled,
          needsUpdate,
          sizeBytes,
          bookCount: item.meta?.bookCount ?? 66,
          verseCount: item.meta?.verseCount ?? 0,
          sourceTitle: item.meta?.sourceTitle || item.humanName || '',
          isDefault: !!item.meta?.isDefault,
          coverImage: item.meta?.coverImage || undefined,
          ownerEmail: item.meta?.ownerEmail || item.ownerEmail || undefined,
          isOwner: item.meta?.isOwner ?? item.isOwner ?? false,
          canEdit: item.meta?.canEdit ?? item.canEdit ?? false,
        });
      }
    } catch (e) {
      console.warn('[BibleByFilesService] Failed to fetch remote bible registry, falling back to local files:', (e as Error)?.message);
    }

    // 2. Добавляем локальные переводы, которых не было в реестре (например синодальный или оффлайн)
    for (const short of shortBibles) {
      const normKey = short.keyForSearch.toLowerCase().trim();
      if (processedKeys.has(normKey)) continue;

      const fullBible = this.loadBible(short.keyForSearch);
      const verseCount = fullBible
        ? fullBible.books.reduce(
            (sum, book) => sum + book.chapters.reduce((s, ch) => s + (ch.subsections?.[0]?.content?.length ?? 0), 0),
            0
          )
        : 0;

      const filePath = this.findBibleFilePath(short.keyForSearch);
      let sizeBytes = 0;
      if (filePath && fs.existsSync(filePath)) {
        sizeBytes = fs.statSync(filePath).size;
      }

      cards.push({
        fileKey: short.keyForSearch,
        title: short.title,
        language: short.lang,
        localVersion: Number(short.version) || 1,
        remoteVersion: Number(short.version) || 1,
        isInstalled: true,
        needsUpdate: false,
        sizeBytes,
        bookCount: fullBible ? fullBible.books.length : 66,
        verseCount,
        sourceTitle: short.sourceTitle,
        isDefault: short.isDefault,
        coverImage: short.coverImage || fullBible?.coverImage || undefined,
      });
    }

    return cards.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Установка перевода: скачивание JSON с сервера и сохранение в USER_ASSETS.
   */
  async installDictionary(fileKey: string, downloadUrl?: string, authHeader?: string): Promise<void> {
    let url = downloadUrl;
    if (!url) {
      // Ищем ID в registry
      const remoteUrl = `${this.getRemoteApiUrl()}/api/bibles/registry`;
      const res = await axios.get<BibleRegistryResponseDto>(remoteUrl, {
        headers: this.getAuthHeaders(authHeader),
        timeout: 15000,
      });
      const item = res.data?.items?.find((i) => i.fileKey?.toLowerCase() === fileKey.toLowerCase());
      if (item) {
        url = `${this.getRemoteApiUrl()}/api/bibles/${item.id}/export`;
      } else {
        throw new Error(`Bible with fileKey "${fileKey}" not found in registry`);
      }
    }

    const res = await axios.get<string | object>(url, {
      headers: this.getAuthHeaders(authHeader),
      responseType: 'text',
      timeout: 180000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    const targetDir = this.assetsPathNew || this.assetsPath;
    fs.mkdirSync(targetDir, { recursive: true });

    const fileName = fileKey.toLowerCase().endsWith('.bible.json') ? fileKey : `${fileKey}.bible.json`;
    const targetPath = path.resolve(targetDir, fileName);
    fs.writeFileSync(targetPath, content, 'utf-8');

    this.clearCache();
    console.log(`[BibleByFilesService] installDictionary success for ${fileKey} -> ${targetPath}`);
  }

  /**
   * Удаление локального перевода.
   */
  async deleteDictionary(fileKey: string): Promise<void> {
    const filePath = this.findBibleFilePath(fileKey);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.clearCache();
    console.log(`[BibleByFilesService] deleteDictionary called for ${fileKey}`);
  }

  /**
   * Очистка всех пользовательских переводов (кроме синодального/дефолтных).
   */
  async clearDictionaries(): Promise<void> {
    const shortBibles = this.getAllShortBibles();
    for (const short of shortBibles) {
      if (!short.isDefault && !short.keyForSearch.toLowerCase().includes('rus_synodal')) {
        const filePath = this.findBibleFilePath(short.keyForSearch);
        // Не удаляем встроенные в дистрибутив файлы
        if (
          filePath &&
          this.assetsPathNew &&
          this.assetsPathNew !== this.assetsPath &&
          filePath.startsWith(this.assetsPathNew) &&
          fs.existsSync(filePath)
        ) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.error('[BibleByFilesService] Error deleting file', filePath, e);
          }
        }
      }
    }
    this.clearCache();
    console.log('[BibleByFilesService] clearDictionaries called');
  }

  private findBibleFilePath(keyForSearch: string): string | null {
    const dirs = this.getExistingDirs();

    for (const dir of dirs) {
      const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.bible.json'));
      for (const file of files) {
        const filePath = path.resolve(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const keyMatch = content.match(/"keyForSearch"\s*:\s*"([^"]+)"/);
        if (keyMatch && keyMatch[1] === keyForSearch) {
          return filePath;
        }
      }
    }
    return null;
  }
}
