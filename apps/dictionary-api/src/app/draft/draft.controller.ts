import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as schema from '../../lib/db/schema';
import { DatabaseService } from '../database/database.service';
import { SongsService } from '../songs/songs.service';
import { ImportSongBookDto } from '../songs/dto/import-song-book.dto';

@ApiExcludeController()
@Controller('draft')
export class DraftController {
  constructor(
    private readonly songsService: SongsService,
    private readonly db: DatabaseService,
  ) {}

  @Get('import')
  @Header('Content-Type', 'text/html; charset=utf-8')
  importForm(): string {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Not available in production');
    }
    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Import SongBookExport → PostgreSQL</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#111; color:#eee; padding:24px; }
    form { max-width: 720px; border:1px solid #333; padding:16px; border-radius:8px; background:#161616; }
    label { display:block; margin-top:12px; }
    input, button { width:100%; margin-top:6px; padding:8px; background:#222; color:#eee; border:1px solid #444; }
    button { margin-top:16px; cursor:pointer; }
    button:hover { background:#2a2a2a; }
    .hint { font-size:12px; color:#aaa; margin-top:8px; }
  </style>
</head>
<body>
  <h2>Импорт SongBookExport JSON → PostgreSQL</h2>

  <form id="importForm">
    <label>
      Catalog ID:
      <input type="number" name="catalogId" value="1" min="1" required />
    </label>

    <label>
      Название (meta.title):
      <input type="text" name="bookTitle" value="" />
    </label>

    <label>
      Источник (meta.source):
      <input type="text" name="bookSource" value="" />
    </label>

    <label>
      Язык (meta.language):
      <input type="text" name="bookLanguage" value="" />
    </label>

    <label>
      Описание (meta.description):
      <input type="text" name="bookDescription" value="" />
    </label>

    <label>
      Обложка (meta.coverImage) файлом:
      <input type="file" name="coverImageFile" accept="image/*" />
    </label>

    <label>
      JSON файл (SongBookExport):
      <input type="file" name="json" accept=".json,application/json" required />
    </label>

    <button type="submit">Импортировать</button>

    <div class="hint">
      Отправка идёт как <code>application/json</code> на <code>POST /api/draft/import-json</code> (без multipart).
    </div>
  </form>

  <h2 style="margin-top:24px;">Удаление (draft)</h2>

  <form method="post" action="/api/draft/delete-book">
    <label>
      Удалить сборник по fileKey (каскадом удалит songs/lyrics/lines/meta):
      <input type="text" name="fileKey" placeholder="pesn_vozrojdeniya" required />
    </label>
    <button type="submit">Удалить сборник</button>
    <div class="hint">Это удалит одну книгу из <code>song_books</code> и всё зависимое.</div>
  </form>

  <form method="post" action="/api/draft/delete-catalog">
    <label>
      Удалить каталог по catalogId (каскадом удалит все книги в каталоге):
      <input type="number" name="catalogId" min="1" required />
    </label>
    <button type="submit">Удалить каталог</button>
    <div class="hint"><b>Осторожно:</b> удалит все <code>song_books</code> в каталоге и всё зависимое.</div>
  </form>

  <script>
    (function() {
      const form = document.getElementById('importForm');
      if (!form) return;

      function readFileAsText(file) {
        return new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onerror = () => reject(new Error('FileReader error'));
          r.onload = () => resolve(String(r.result || ''));
          r.readAsText(file);
        });
      }

      function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onerror = () => reject(new Error('FileReader error'));
          r.onload = () => resolve(String(r.result || ''));
          r.readAsDataURL(file);
        });
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fd = new FormData(form);
        const catalogId = Number(fd.get('catalogId'));
        const bookTitle = String(fd.get('bookTitle') || '');
        const bookSource = String(fd.get('bookSource') || '');
        const bookLanguage = String(fd.get('bookLanguage') || '');
        const bookDescription = String(fd.get('bookDescription') || '');

        const jsonFile = fd.get('json');
        if (!(jsonFile instanceof File) || !jsonFile.size) {
          alert('Выбери JSON файл');
          return;
        }

        const payloadText = await readFileAsText(jsonFile);
        let data;
        try {
          data = JSON.parse(payloadText);
        } catch {
          alert('Некорректный JSON');
          return;
        }

        let coverImageDataUrl = null;
        const coverFile = fd.get('coverImageFile');
        if (coverFile instanceof File && coverFile.size) {
          coverImageDataUrl = await readFileAsDataUrl(coverFile);
        }

        const resp = await fetch('/api/draft/import-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            catalogId,
            data,
            metaPatch: {
              title: bookTitle,
              source: bookSource,
              language: bookLanguage,
              description: bookDescription,
              coverImage: coverImageDataUrl,
            }
          }),
        });

        const html = await resp.text();
        document.open();
        document.write(html);
        document.close();
      });
    })();
  </script>
</body>
</html>`;
  }

  @Post('import-json')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async importJson(
    @Body()
    body: {
      catalogId?: number;
      data?: unknown;
      metaPatch?: Record<string, unknown>;
    },
  ): Promise<string> {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Not available in production');
    }

    const requestedCatalogId = Number(body.catalogId);
    if (!Number.isFinite(requestedCatalogId) || requestedCatalogId < 1) {
      throw new BadRequestException('catalogId must be a positive number');
    }

    const catalogId = await this.ensureSongsCatalog(requestedCatalogId);

    const data = body.data;
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('data must be an object');
    }

    const metaPatchRaw = body.metaPatch ?? {};
    const metaPatch: Record<string, string> = {};
    for (const [k, v] of Object.entries(metaPatchRaw)) {
      if (typeof v === 'string' && v.trim() !== '') {
        metaPatch[k] = v;
      }
    }

    const casted = data as { meta?: Record<string, string> };
    const merged: ImportSongBookDto = {
      catalogId,
      data: {
        ...(data as any),
        meta: {
          ...(casted.meta ?? {}),
          ...metaPatch,
        },
      },
    };

    const res = await this.songsService.importSongBook(merged);

    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Import result</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#111; color:#eee; padding:24px; }
    pre { background:#161616; padding:16px; border-radius:8px; border:1px solid #333; overflow:auto; }
    a { color: #4ea1ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h2>Результат импорта</h2>
  <pre>${escapeHtml(JSON.stringify(res, null, 2))}</pre>
  <p><a href="/api/draft/import">← Назад</a></p>
</body>
</html>`;
  }

  @Post('delete-book')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async deleteBook(
    @Body()
    body: {
      fileKey?: string;
    },
  ): Promise<string> {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Not available in production');
    }

    const fileKey = typeof body.fileKey === 'string' ? body.fileKey.trim() : '';
    if (!fileKey) {
      throw new BadRequestException('fileKey is required');
    }

    const db = this.db.client;
    const deleted = await db
      .delete(schema.songBooks)
      .where(eq(schema.songBooks.fileKey, fileKey))
      .returning({ id: schema.songBooks.id, fileKey: schema.songBooks.fileKey });

    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Delete book</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#111; color:#eee; padding:24px; }
    pre { background:#161616; padding:16px; border-radius:8px; border:1px solid #333; overflow:auto; }
    a { color: #4ea1ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h2>Результат удаления сборника</h2>
  <pre>${escapeHtml(JSON.stringify({ ok: true, deleted }, null, 2))}</pre>
  <p><a href="/api/draft/import">← Назад</a></p>
</body>
</html>`;
  }

  @Post('delete-catalog')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async deleteCatalog(
    @Body()
    body: {
      catalogId?: string | number;
    },
  ): Promise<string> {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Not available in production');
    }

    const catalogId = Number(body.catalogId);
    if (!Number.isFinite(catalogId) || catalogId < 1) {
      throw new BadRequestException('catalogId must be a positive number');
    }

    const db = this.db.client;
    const deleted = await db
      .delete(schema.catalogs)
      .where(eq(schema.catalogs.id, catalogId))
      .returning({ id: schema.catalogs.id, code: schema.catalogs.code, type: schema.catalogs.type });

    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Delete catalog</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#111; color:#eee; padding:24px; }
    pre { background:#161616; padding:16px; border-radius:8px; border:1px solid #333; overflow:auto; }
    a { color: #4ea1ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h2>Результат удаления каталога</h2>
  <pre>${escapeHtml(JSON.stringify({ ok: true, deleted }, null, 2))}</pre>
  <p><a href="/api/draft/import">← Назад</a></p>
</body>
</html>`;
  }

  private async ensureSongsCatalog(requestedCatalogId: number): Promise<number> {
    const db = this.db.client;

    const [existingById] = await db
      .select({ id: schema.catalogs.id })
      .from(schema.catalogs)
      .where(eq(schema.catalogs.id, requestedCatalogId))
      .limit(1);
    if (existingById) return existingById.id;

    const code = 'songs';
    const [existingByCode] = await db
      .select({ id: schema.catalogs.id })
      .from(schema.catalogs)
      .where(eq(schema.catalogs.code, code))
      .limit(1);
    if (existingByCode) return existingByCode.id;

    const [created] = await db
      .insert(schema.catalogs)
      .values({
        code,
        type: 'songs',
        title: 'Songs',
        updatedBy: 'draft-import',
        version: 1,
      })
      .returning({ id: schema.catalogs.id });

    await db
      .insert(schema.datasetMeta)
      .values({ id: 1, schemaVersion: 1, version: randomUUID() })
      .onConflictDoNothing();

    return created.id;
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
