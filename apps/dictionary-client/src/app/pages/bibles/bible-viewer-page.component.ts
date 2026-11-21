import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProgressBarModule } from 'primeng/progressbar';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';
import { BadgeModule } from 'primeng/badge';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import {
  BibleBook,
  BibleChapter,
  BibleTranslate,
  BibleVerse,
} from '@lyri-cast/entities';
import {
  BiblesDictionaryApiService,
  UpdateBibleMetaDto,
} from '@lyri-cast/shared-browser/data-access/dictionaries';
import { BibleMetaDialogComponent } from './components/meta-dialog/bible-meta-dialog.component';

@Component({
  standalone: true,
  selector: 'lyri-bible-viewer-page',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ProgressBarModule,
    DialogModule,
    ToastModule,
    TooltipModule,
    SkeletonModule,
    BadgeModule,
    ProgressSpinnerModule,
    BibleMetaDialogComponent,
  ],
  providers: [MessageService],
  templateUrl: './bible-viewer-page.component.html',
  styleUrl: './bible-viewer-page.component.scss',
})
export class BibleViewerPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(BiblesDictionaryApiService);
  private readonly messageService = inject(MessageService);

  bibleId!: number;
  bible: BibleTranslate | null = null;
  isLoading = true;
  isLoadingVerses = false;

  // Экспорт с прогрессом
  isExporting = false;
  exportProgress: number | null = null;

  // Поиск и выбор книги
  searchBookQuery = '';
  searchVerseQuery = '';
  selectedBook: BibleBook | null = null;
  selectedChapter: BibleChapter | null = null;

  // Редактирование стиха
  editingVerseId: number | null = null;
  editingVerseText = '';
  isSavingVerse = false;

  // Диалог метаданных
  metaDialogVisible = false;

  get bibleTitle(): string {
    const t = this.bible?.title?.trim() || this.bible?.humanName?.trim() || this.bible?.sourceTitle?.trim();
    return t || '';
  }

  get filteredVerses(): BibleVerse[] {
    const list = this.currentVerses;
    if (!list?.length) return [];
    if (!this.searchVerseQuery.trim()) return list;
    const q = this.searchVerseQuery.toLowerCase().trim();
    return list.filter(
      (v) =>
        v.text?.toLowerCase().includes(q) ||
        v.number.toString() === q
    );
  }

  get filteredBooks(): BibleBook[] {
    if (!this.bible?.books) return [];
    if (!this.searchBookQuery.trim()) return this.bible.books;
    const q = this.searchBookQuery.toLowerCase().trim();
    return this.bible.books.filter(
      (b) =>
        b.title.full.toLowerCase().includes(q) ||
        b.title.short.toLowerCase().includes(q) ||
        String(b.number).includes(q)
    );
  }

  get currentVerses(): BibleVerse[] {
    if (!this.selectedChapter?.subsections) return [];
    return this.selectedChapter.subsections.flatMap((s) => s.content ?? []);
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('bibleId') || this.route.snapshot.paramMap.get('id');
    this.bibleId = Number(idParam);
    if (!this.bibleId) {
      this.goBack();
      return;
    }

    this.loadBible();
  }

  goBack(): void {
    this.router.navigate(['/bibles']);
  }

  loadBible(): void {
    this.isLoading = true;
    this.api.getBibleStructure(this.bibleId).subscribe({
      next: (bible) => {
        if (!bible.title && bible.humanName) {
          bible.title = bible.humanName;
        } else if (!bible.title && bible.sourceTitle) {
          bible.title = bible.sourceTitle;
        }
        this.bible = bible;
        this.isLoading = false;

        // По умолчанию выбираем первую книгу и первую главу
        if (bible.books.length > 0) {
          this.selectBook(bible.books[0]);
        }
      },
      error: () => {
        this.isLoading = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось загрузить структуру Библии',
        });
      },
    });
  }

  selectBook(book: BibleBook): void {
    this.selectedBook = book;
    this.cancelEditVerse();
    if (book.chapters && book.chapters.length > 0) {
      this.selectChapter(book.chapters[0]);
    } else {
      this.selectedChapter = null;
    }
  }

  selectChapter(chapter: BibleChapter): void {
    this.selectedChapter = chapter;
    this.cancelEditVerse();

    if (chapter.subsections?.[0]?.content?.length) {
      return;
    }

    const chapterDbId = (chapter as unknown as { id?: number }).id;
    if (!chapterDbId) return;

    this.isLoadingVerses = true;
    this.api.getChapterVerses(this.bibleId, chapterDbId).subscribe({
      next: (verses) => {
        chapter.subsections = [
          {
            heading: '',
            bookId: this.selectedBook?.number ?? 1,
            chapterId: chapter.number,
            content: verses.map((v) => ({
              id: v.id,
              contentType: 'line' as const,
              number: v.number,
              text: v.text,
              bookId: this.selectedBook?.number ?? 1,
              chapterId: chapter.number,
              path: [this.selectedBook?.number ?? 1, chapter.number, v.number].map(String),
            })),
          },
        ];
        this.isLoadingVerses = false;
      },
      error: () => {
        this.isLoadingVerses = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось загрузить стихи главы',
        });
      },
    });
  }

  startEditVerse(verse: BibleVerse): void {
    this.editingVerseId = verse.id ?? verse.number;
    this.editingVerseText = verse.text;
  }

  cancelEditVerse(): void {
    this.editingVerseId = null;
    this.editingVerseText = '';
  }

  saveVerse(verse: BibleVerse): void {
    const targetId = verse.id ?? verse.number;
    const newText = this.editingVerseText.trim();
    if (!newText) return;

    this.isSavingVerse = true;
    this.api.updateVerse(this.bibleId, targetId, newText).subscribe({
      next: () => {
        verse.text = newText;
        this.isSavingVerse = false;
        this.cancelEditVerse();
        this.messageService.add({
          severity: 'success',
          summary: 'Стих сохранён',
          detail: `Стих ${verse.number} успешно обновлён`,
        });
      },
      error: (err: unknown) => {
        this.isSavingVerse = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: (err as { message?: string })?.message || 'Не удалось сохранить стих',
        });
      },
    });
  }

  openMetaDialog(): void {
    this.metaDialogVisible = true;
  }

  closeMetaDialog(): void {
    this.metaDialogVisible = false;
  }

  handleMetaCompleted(meta: UpdateBibleMetaDto): void {
    this.metaDialogVisible = false;
    if (this.bible) {
      const newTitle = meta.title || meta.humanName;
      if (newTitle) {
        this.bible.title = newTitle;
        this.bible.humanName = newTitle;
      }
      if (meta.language) this.bible.lang = meta.language;
      if (meta.sourceTitle) this.bible.sourceTitle = meta.sourceTitle;
      if (meta.version !== undefined) this.bible.version = meta.version;
      if (meta.isDefault !== undefined) this.bible.isDefault = meta.isDefault;
      if (meta.isClassicBookOrder !== undefined) this.bible.isClassicBookOrder = meta.isClassicBookOrder;
      if (meta.coverImage !== undefined) this.bible.coverImage = meta.coverImage;
    }
    this.messageService.add({
      severity: 'success',
      summary: 'Метаданные обновлены',
      detail: 'Свойства перевода успешно сохранены',
    });
  }

  exportJson(): void {
    if (!this.bible || this.isExporting) return;
    this.isExporting = true;
    this.exportProgress = 0;

    this.messageService.add({
      severity: 'info',
      summary: 'Экспорт начат',
      detail: 'Загрузка полного перевода с сервера...',
    });

    this.api.getBibleWithProgress(this.bibleId).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.DownloadProgress) {
          if (event.total && event.total > 0) {
            this.exportProgress = Math.min(99, Math.round((event.loaded * 100) / event.total));
          } else {
            const estimatedTotal = 6 * 1024 * 1024;
            this.exportProgress = Math.min(95, Math.round((event.loaded * 100) / estimatedTotal));
          }
        } else if (event.type === HttpEventType.Response) {
          this.exportProgress = 100;
          const fullBible = event.body;
          if (fullBible) {
            const jsonStr = JSON.stringify(fullBible, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${fullBible.keyForSearch || 'bible'}.bible.json`;
            a.click();
            URL.revokeObjectURL(url);
          }

          setTimeout(() => {
            this.isExporting = false;
            this.exportProgress = null;
          }, 1200);

          this.messageService.add({
            severity: 'success',
            summary: 'Экспорт',
            detail: 'Файл JSON успешно сохранен',
          });
        }
      },
      error: (err) => {
        this.isExporting = false;
        this.exportProgress = null;
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка экспорта',
          detail: err?.message || 'Не удалось экспортировать перевод в JSON',
        });
      },
    });
  }
}
