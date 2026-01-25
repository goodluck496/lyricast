import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {
  FileUpload,
  FileUploadHandlerEvent,
  FileUploadModule,
} from 'primeng/fileupload';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, take } from 'rxjs';
import {
  ImportSongBookDto,
  SongBookExportDto,
} from '@lyri-cast/openapi-songs-dictionary';
import {
  CreateSongBookRequest,
  SongsDictionaryApiService,
} from '@lyri-cast/data-access-dictionaries';
import { AuthOverlayService } from '../../../../auth/auth-overlay.service';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { CatalogListItem } from '@lyri-cast/data-access-dictionaries';
import { Select } from 'primeng/select';

@Component({
  selector: 'lyri-import-book-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FloatLabelModule,
    InputTextModule,
    TextareaModule,
    ButtonModule,
    ProgressSpinnerModule,
    FileUploadModule,
    SelectButtonModule,
    SongDictionaryCardComponent,
    Select,
  ],
  templateUrl: './import-book-dialog.component.html',
  styleUrls: ['./import-book-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportBookDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(SongsDictionaryApiService);
  private authOverlay = inject(AuthOverlayService);
  private cdr = inject(ChangeDetectorRef);

  @Output() completed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  @ViewChild('jsonFileUpload') jsonFileUpload?: FileUpload;
  @ViewChild('coverFileUpload') coverFileUpload?: FileUpload;

  readonly newCatalogValue = 'new';
  form: FormGroup = this.fb.group({
    catalogId: [null, [Validators.required]],
    newCatalogTitle: [''],
    bookTitle: [''],
    bookSource: [''],
    bookLanguage: [''],
    bookDescription: [''],
    fileKey: [''],
  });

  jsonFile: File | null = null;
  coverFile: File | null = null;
  coverDataUrl: string | null = null;
  importError = '';
  submitting = false;
  catalogsLoading = false;
  catalogs: CatalogListItem[] = [];
  readonly modeOptions: { label: string; value: 'import' | 'manual' }[] = [
    { label: 'Импорт из JSON', value: 'import' },
    { label: 'Создать пустой сборник', value: 'manual' },
  ];
  mode: 'import' | 'manual' = 'import';

  ngOnInit(): void {
    this.loadCatalogs();
  }

  get catalogOptions(): { label: string; value: number | 'new' }[] {
    const base = this.catalogs.map((c) => ({
      label: c.title,
      value: c.id,
    }));
    return [...base, { label: 'Новый каталог', value: this.newCatalogValue }];
  }

  onJsonFileUpload(event: FileUploadHandlerEvent): void {
    const file = event.files?.[0];
    this.jsonFile = file ?? null;
    this.jsonFileUpload?.clear();
  }

  onCoverFileUpload(event: FileUploadHandlerEvent): void {
    const file = event.files?.[0];
    this.coverFile = file ?? null;
    if (file) {
      this.readFileAsDataUrl(file).then((dataUrl) => {
        this.coverDataUrl = dataUrl;
        this.cdr.markForCheck();
      });
    } else {
      this.coverDataUrl = null;
      this.cdr.markForCheck();
    }
    this.coverFileUpload?.clear();
  }

  onCancel(): void {
    if (this.submitting) return;
    this.resetFormState();
    this.cancelled.emit();
  }

  async onSubmit(): Promise<void> {
    if (this.submitting) return;
    this.importError = '';

    this.submitting = true;

    let catalogId: number;
    try {
      catalogId = await this.resolveCatalogId();
    } catch (err) {
      this.submitting = false;
      this.importError =
        err instanceof Error ? err.message : 'Не удалось выбрать каталог.';
      this.cdr.markForCheck();
      return;
    }

    if (this.mode === 'manual') {
      this.createManualSongBook(catalogId);
      return;
    }

    if (!this.jsonFile) {
      this.importError = 'Добавьте JSON-файл выгрузки SongBook.';
      this.submitting = false;
      return;
    }

    this.submitting = true;
    try {
      const payload = await this.buildPayload(catalogId);
      this.api
        .importSongBook(payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.submitting = false;
            this.resetFormState();
            this.completed.emit();
          },
          error: (err: HttpErrorResponse) => {
            this.submitting = false;
            if (err.status === 401) {
              this.authOverlay
                .openAndWaitForToken()
                .pipe(take(1))
                .subscribe(() => this.onSubmit());
              return;
            }
            this.importError =
              err.error?.message || err.message || 'Не удалось импортировать.';
          },
        });
    } catch (err) {
      this.submitting = false;
      this.importError =
        err instanceof Error ? err.message : 'Не удалось прочитать файлы.';
    }
  }

  private async buildPayload(catalogId: number): Promise<ImportSongBookDto> {
    if (!this.jsonFile) {
      throw new Error('JSON-файл не выбран.');
    }

    const text = await this.readFileAsText(this.jsonFile);
    let data: SongBookExportDto;
    try {
      data = JSON.parse(text) as SongBookExportDto;
    } catch {
      throw new Error('JSON-файл имеет неверный формат.');
    }

    const metaPatch = this.buildMetaPatch();
    data.meta = { ...(data.meta ?? {}), ...metaPatch };

    if (this.coverDataUrl) {
      data.meta['coverImage'] = this.coverDataUrl;
    }

    return {
      catalogId,
      data,
    };
  }

  private buildMetaPatch(): Record<string, string> {
    const { bookTitle, bookSource, bookLanguage, bookDescription } =
      this.form.value;
    const patch: Record<string, string> = {};
    if (bookTitle?.trim()) patch['title'] = bookTitle.trim();
    if (bookSource?.trim()) patch['source'] = bookSource.trim();
    if (bookLanguage?.trim()) patch['language'] = bookLanguage.trim();
    if (bookDescription?.trim()) patch['description'] = bookDescription.trim();
    return patch;
  }

  private resetFormState(): void {
    this.form.reset({
      catalogId: this.getDefaultCatalogId(),
      newCatalogTitle: '',
      bookTitle: '',
      bookSource: '',
      bookLanguage: '',
      bookDescription: '',
      fileKey: '',
    });
    this.jsonFile = null;
    this.coverFile = null;
    this.coverDataUrl = null;
    this.importError = '';
    this.mode = 'import';
  }

  handleModeChange(mode: 'import' | 'manual'): void {
    if (!mode || this.mode === mode) return;
    this.mode = mode;
    this.importError = '';
    if (mode === 'manual') {
      this.jsonFile = null;
      this.jsonFileUpload?.clear();
    }
  }

  get isImportMode(): boolean {
    return this.mode === 'import';
  }

  private createManualSongBook(catalogId: number): void {
    this.submitting = true;
    const { bookTitle, bookSource, bookLanguage, bookDescription, fileKey } =
      this.form.value;

    const payload: CreateSongBookRequest = {
      catalogId,
    };

    if (bookTitle?.trim()) payload.title = bookTitle.trim();
    if (bookSource?.trim()) payload.source = bookSource.trim();
    if (bookLanguage?.trim()) payload.language = bookLanguage.trim();
    if (bookDescription?.trim()) payload.description = bookDescription.trim();
    if (fileKey?.trim()) payload.fileKey = fileKey.trim();
    if (this.coverDataUrl) {
      payload.coverImage = this.coverDataUrl;
    }

    this.api
      .createSongBook(payload)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.submitting = false;
          this.resetFormState();
          this.completed.emit();
        },
        error: (err: HttpErrorResponse) => {
          this.submitting = false;
          if (err.status === 401) {
            this.authOverlay
              .openAndWaitForToken()
              .pipe(take(1))
              .subscribe(() => this.createManualSongBook(catalogId));
            return;
          }
          this.importError =
            err.error?.message || err.message || 'Не удалось создать сборник.';
        },
      });
  }

  private async resolveCatalogId(): Promise<number> {
    const selection = this.form.value.catalogId;
    const newCatalogTitle = this.form.value.newCatalogTitle?.trim() ?? '';

    if (selection === this.newCatalogValue) {
      if (!newCatalogTitle) {
        throw new Error('Введите название нового каталога.');
      }

      try {
        const catalog = await this.api.ensureCatalogExists(newCatalogTitle);
        this.refreshCatalogsAfterCreate(catalog);
        return catalog.id;
      } catch (err) {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          await firstValueFrom(
            this.authOverlay.openAndWaitForToken().pipe(take(1))
          );
          const catalog = await this.api.ensureCatalogExists(newCatalogTitle);
          this.refreshCatalogsAfterCreate(catalog);
          return catalog.id;
        }
        throw err instanceof Error
          ? err
          : new Error('Не удалось создать каталог.');
      }
    }

    const catalogId = Number(selection ?? 0);
    if (!Number.isFinite(catalogId) || catalogId < 1) {
      throw new Error('Каталог не выбран.');
    }
    return catalogId;
  }

  private loadCatalogs(): void {
    this.catalogsLoading = true;
    this.api
      .getCatalogs()
      .pipe(take(1))
      .subscribe({
        next: (catalogs) => {
          this.catalogs = catalogs;
          this.catalogsLoading = false;
          this.ensureCatalogControlInitialized();
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.catalogsLoading = false;
          if (err.status === 401) {
            this.authOverlay
              .openAndWaitForToken()
              .pipe(take(1))
              .subscribe(() => this.loadCatalogs());
            return;
          }
          this.importError =
            err.error?.message ||
            err.message ||
            'Не удалось загрузить каталоги.';
          this.cdr.markForCheck();
        },
      });
  }

  private ensureCatalogControlInitialized(): void {
    const current = this.form.value.catalogId;
    if (current === this.newCatalogValue) return;
    if (Number.isFinite(Number(current)) && Number(current) > 0) return;
    this.form.patchValue({ catalogId: this.getDefaultCatalogId() });
  }

  private getDefaultCatalogId(): number | 'new' {
    return this.catalogs[0]?.id ?? this.newCatalogValue;
  }

  private refreshCatalogsAfterCreate(catalog: CatalogListItem): void {
    const exists = this.catalogs.find((c) => c.id === catalog.id);
    if (!exists) {
      this.catalogs = [...this.catalogs, catalog];
    }
    this.form.patchValue({ catalogId: catalog.id });
    this.cdr.markForCheck();
  }

  get previewDb(): SongDatabaseInfoDto {
    const { bookTitle, bookSource, bookLanguage, bookDescription, fileKey } =
      this.form.value;
    return {
      db:
        this.mode === 'import'
          ? this.jsonFile?.name || 'songbook.sqlite'
          : `${fileKey?.trim() || 'manual-songbook'}.sqlite`,
      title: bookTitle?.trim() || 'Новый сборник',
      description:
        bookDescription?.trim() ||
        (bookSource?.trim()
          ? `Источник: ${bookSource.trim()}`
          : 'Описание появится после импорта'),
      language: bookLanguage?.trim() || undefined,
      coverImage: this.coverDataUrl ?? undefined,
      sizeBytes: this.jsonFile?.size,
    };
  }

  formatBytes(bytes?: number | null): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) {
      return `${bytes} Б`;
    }
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} КБ`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} МБ`;
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
