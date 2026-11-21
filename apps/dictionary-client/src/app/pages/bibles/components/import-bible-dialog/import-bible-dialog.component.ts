import { Component, EventEmitter, inject, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SharedModule } from 'primeng/api';
import { BibleTranslate, SongDatabaseInfoDto } from '@lyri-cast/entities';
import { parseMyBibleSqlite } from '@lyri-cast/common';
import { BiblesDictionaryApiService } from '@lyri-cast/shared-browser/data-access/dictionaries';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import {
  COUNTRIES_FLAGS,
  CountryFlagItem,
  findFlagByLanguage,
  findLanguage,
  LANGUAGES_OPTIONS,
  LanguageOption,
  svgFlagToDataUrl,
} from '../../flags-data';

let cachedWasmBinaryPromise: Promise<ArrayBuffer> | null = null;

async function loadSqlJsWasmBinary(): Promise<ArrayBuffer> {
  if (cachedWasmBinaryPromise) {
    return cachedWasmBinaryPromise;
  }

  cachedWasmBinaryPromise = (async () => {
    const urls: string[] = [];
    if (typeof document !== 'undefined' && document.baseURI) {
      try {
        urls.push(new URL('assets/sql-wasm.wasm', document.baseURI).href);
        urls.push(new URL('sql-wasm.wasm', document.baseURI).href);
      } catch {
        // ignore invalid baseURI
      }
    }
    urls.push('/assets/sql-wasm.wasm');
    urls.push('/sql-wasm.wasm');
    urls.push('assets/sql-wasm.wasm');
    urls.push('https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.wasm');
    urls.push('https://sql.js.org/dist/sql-wasm.wasm');

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const header = new Uint8Array(buf.slice(0, 4));
        // Verify WASM magic bytes: \0 a s m (0x00, 0x61, 0x73, 0x6d)
        if (
          header.length >= 4 &&
          header[0] === 0x00 &&
          header[1] === 0x61 &&
          header[2] === 0x73 &&
          header[3] === 0x6d
        ) {
          return buf;
        }
      } catch {
        // continue to next URL candidate
      }
    }

    throw new Error('Не удалось загрузить модуль sql-wasm.wasm (проверьте подключение к сети или наличие assets)');
  })();

  return cachedWasmBinaryPromise;
}

@Component({
  standalone: true,
  selector: 'lyri-import-bible-dialog',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    FloatLabelModule,
    ProgressSpinnerModule,
    ProgressBarModule,
    MessageModule,
    SelectModule,
    SharedModule,
    SongDictionaryCardComponent,
  ],
  templateUrl: './import-bible-dialog.component.html',
  styleUrl: './import-bible-dialog.component.scss',
})
export class ImportBibleDialogComponent {
  private readonly api = inject(BiblesDictionaryApiService);

  @Output() completed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  selectedFile: File | null = null;
  parsedBible: BibleTranslate | null = null;
  title = '';
  language = '';
  catalogId = 1;
  coverImage: string | null = null;
  ownerEmail = '';

  readonly countries = COUNTRIES_FLAGS;
  selectedCountry: CountryFlagItem | null = null;

  readonly languages = LANGUAGES_OPTIONS;
  selectedLanguage: LanguageOption | null = null;
  isManualLanguage = false;

  isParsing = false;
  isSaving = false;
  uploadProgress = 0;
  uploadStatusText = '';
  errorMessage = '';

  get previewDb(): SongDatabaseInfoDto {
    return {
      db: this.parsedBible?.keyForSearch || 'preview',
      title: this.title || 'Название перевода',
      language: this.language || 'ru',
      coverImage: this.coverImage ?? undefined,
      songCount: this.parsedBible?.books?.length ?? 66,
      version: 1,
      localVersion: 1,
      ownerEmail: this.ownerEmail.trim() || undefined,
    };
  }

  async onCountryChange(country: CountryFlagItem | null): Promise<void> {
    this.selectedCountry = country;
    if (country) {
      try {
        this.coverImage = await svgFlagToDataUrl(country.flagUrl);
      } catch (err) {
        console.error('Failed to load flag', err);
      }
    } else {
      this.coverImage = null;
    }
  }

  onLanguageSelect(langItem: LanguageOption | null): void {
    this.selectedLanguage = langItem;
    this.language = langItem ? langItem.code : '';
    if (langItem) {
      const flagItem = findFlagByLanguage(langItem.code);
      if (flagItem && (!this.selectedCountry || !this.coverImage)) {
        void this.onCountryChange(flagItem);
      }
    }
  }

  onManualLanguageInput(val: string): void {
    this.language = val;
    const match = findLanguage(val);
    if (match) {
      this.selectedLanguage = match;
      const flagItem = findFlagByLanguage(match.code);
      if (flagItem && (!this.selectedCountry || !this.coverImage)) {
        void this.onCountryChange(flagItem);
      }
    }
  }

  toggleManualLanguage(): void {
    this.isManualLanguage = !this.isManualLanguage;
    if (!this.isManualLanguage) {
      this.selectedLanguage = findLanguage(this.language) ?? null;
      if (this.selectedLanguage) {
        this.language = this.selectedLanguage.code;
      }
    }
  }

  onCustomImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.coverImage = reader.result;
        this.selectedCountry = null;
      }
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  clearCover(): void {
    this.coverImage = null;
    this.selectedCountry = null;
  }

  get totalVersesCount(): number {
    if (!this.parsedBible?.books) return 0;
    return this.parsedBible.books.reduce(
      (sum, book) =>
        sum +
        (book.chapters ?? []).reduce(
          (cSum, ch) => cSum + (ch.subsections?.[0]?.content?.length ?? 0),
          0
        ),
      0
    );
  }

  async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.selectedFile = file;
    this.errorMessage = '';
    this.parsedBible = null;
    this.isParsing = true;

    try {
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith('.sqlite') || lowerName.endsWith('.sqlite3')) {
        const buffer = await file.arrayBuffer();
        const wasmBinary = await loadSqlJsWasmBinary();
        this.parsedBible = await parseMyBibleSqlite(new Uint8Array(buffer), {
          sqlJsConfig: {
            wasmBinary,
          },
        });
      } else if (lowerName.endsWith('.json')) {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!json.books || !Array.isArray(json.books)) {
          throw new Error('Файл не содержит корректную структуру книги Библии');
        }
        this.parsedBible = json as BibleTranslate;
      } else {
        throw new Error('Поддерживаются только форматы .sqlite / .sqlite3 и .json');
      }

      this.title = this.parsedBible.title || file.name.replace(/\.[^/.]+$/, '');
      const rawLang = this.parsedBible.lang?.trim() || '';
      const matchedLang = findLanguage(rawLang);
      if (matchedLang) {
        this.selectedLanguage = matchedLang;
        this.language = matchedLang.code;
        this.isManualLanguage = false;
      } else {
        this.selectedLanguage = null;
        this.language = rawLang;
        this.isManualLanguage = true;
      }

      // Авто-предложение флага страны по коду языка (если фон еще не выбран)
      if (!this.coverImage && this.language) {
        const flagItem = findFlagByLanguage(this.language);
        if (flagItem) {
          this.selectedCountry = flagItem;
          void svgFlagToDataUrl(flagItem.flagUrl).then((dataUrl) => {
            if (!this.coverImage) {
              this.coverImage = dataUrl;
            }
          });
        }
      }
    } catch (err: unknown) {
      this.errorMessage =
        err instanceof Error ? err.message : 'Не удалось разобрать файл перевода';
      this.parsedBible = null;
    } finally {
      this.isParsing = false;
    }
  }

  onSubmit(): void {
    if (!this.parsedBible) return;
    if (!this.title.trim()) {
      this.errorMessage = 'Введите название перевода';
      return;
    }

    this.isSaving = true;
    this.uploadProgress = 0;
    this.uploadStatusText = 'Подготовка к отправке...';
    this.errorMessage = '';

    const payload: BibleTranslate = {
      ...this.parsedBible,
      title: this.title.trim(),
      sourceTitle: this.parsedBible.sourceTitle || this.title.trim(),
      lang: this.language.trim() || 'ru',
      coverImage: this.coverImage || undefined,
    };

    this.api
      .importBibleWithProgress({
        catalogId: this.catalogId,
        data: payload,
        coverImage: this.coverImage || undefined,
        ownerEmail: this.ownerEmail.trim() || undefined,
      })
      .subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress = Math.round((100 * event.loaded) / event.total);
          const loadedMb = (event.loaded / (1024 * 1024)).toFixed(1);
          const totalMb = (event.total / (1024 * 1024)).toFixed(1);
          if (this.uploadProgress < 100) {
            this.uploadStatusText = `Отправка на сервер: ${this.uploadProgress}% (${loadedMb} из ${totalMb} МБ)`;
          } else {
            this.uploadStatusText = 'Данные переданы. Запись в базу данных: пакетная вставка книг и стихов...';
          }
        } else if (event.type === HttpEventType.Response) {
          this.uploadProgress = 100;
          this.uploadStatusText = 'Перевод успешно сохранен в базе данных!';
          this.isSaving = false;
          this.completed.emit();
        }
      },
      error: (err: unknown) => {
        this.isSaving = false;
        this.errorMessage =
          (err as { message?: string })?.message || 'Ошибка сохранения перевода на сервере';
      },
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
