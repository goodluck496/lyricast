import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SharedModule } from 'primeng/api';
import {
  AuthApiService,
  BiblesDictionaryApiService,
  UpdateBibleMetaDto,
} from '@lyri-cast/shared-browser/data-access/dictionaries';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import {
  COUNTRIES_FLAGS,
  CountryFlagItem,
  findFlagByLanguage,
  findLanguage,
  LANGUAGES_OPTIONS,
  LanguageOption,
  svgFlagToDataUrl,
} from '../../flags-data';

export interface UserOption {
  label: string;
  email: string;
  name?: string;
}

@Component({
  standalone: true,
  selector: 'lyri-bible-meta-dialog',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    FloatLabelModule,
    CheckboxModule,
    MessageModule,
    SelectModule,
    SharedModule,
    SongDictionaryCardComponent,
  ],
  templateUrl: './bible-meta-dialog.component.html',
  styleUrl: './bible-meta-dialog.component.scss',
})
export class BibleMetaDialogComponent implements OnInit, OnChanges {
  private readonly api = inject(BiblesDictionaryApiService);
  private readonly authApi = inject(AuthApiService);

  @Input({ required: true }) bibleId!: number;
  @Input() initialTitle = '';
  @Input() initialHumanName = '';
  @Input() initialSourceTitle = '';
  @Input() initialLanguage = 'ru';
  @Input() initialVersion = '';
  @Input() initialIsDefault = false;
  @Input() initialIsClassicBookOrder = false;
  @Input() initialCoverImage = '';
  @Input() initialOwnerEmail = '';
  @Input() initialBookCount = 66;

  @Output() completed = new EventEmitter<UpdateBibleMetaDto>();
  @Output() cancelled = new EventEmitter<void>();

  title = '';
  sourceTitle = '';
  language = '';
  version = '';
  ownerEmail = '';
  isDefault = false;
  isClassicBookOrder = false;
  coverImage = '';

  userOptions: UserOption[] = [];
  selectedUser: UserOption | null = null;

  readonly countries = COUNTRIES_FLAGS;
  selectedCountry: CountryFlagItem | null = null;

  readonly languages = LANGUAGES_OPTIONS;
  selectedLanguage: LanguageOption | null = null;
  isManualLanguage = false;

  isSaving = false;
  errorMessage = '';
  private titleInitialized = false;

  get previewDb(): SongDatabaseInfoDto {
    return {
      db: `bible_${this.bibleId}`,
      title: this.title || 'Название перевода',
      language: this.language || 'ru',
      coverImage: this.coverImage || undefined,
      songCount: this.initialBookCount ?? 66,
      version: Number(this.version) || 1,
      localVersion: Number(this.version) || 1,
      ownerEmail: this.ownerEmail || undefined,
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
      this.coverImage = '';
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
    this.coverImage = '';
    this.selectedCountry = null;
  }

  ngOnInit(): void {
    this.syncFromInputs();
    this.loadUsers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['initialTitle'] ||
      changes['initialHumanName'] ||
      changes['initialSourceTitle'] ||
      changes['initialLanguage'] ||
      changes['initialVersion'] ||
      changes['initialIsDefault'] ||
      changes['initialIsClassicBookOrder'] ||
      changes['initialCoverImage'] ||
      changes['initialOwnerEmail']
    ) {
      this.syncFromInputs();
      this.syncSelectedUser();
    }
  }

  loadUsers(): void {
    this.authApi.getUsers().subscribe({
      next: (users) => {
        const publicOption: UserOption = {
          label: 'Всем (публичный перевод)',
          email: '',
        };
        const mapped: UserOption[] = users.map((u) => ({
          label: u.name ? `${u.name} (${u.email})` : u.email,
          email: u.email,
          name: u.name,
        }));
        this.userOptions = [publicOption, ...mapped];
        this.syncSelectedUser();
      },
      error: (err) => {
        console.warn('[BibleMetaDialog] Failed to load users', err);
        this.userOptions = [{ label: 'Всем (публичный перевод)', email: '' }];
        this.syncSelectedUser();
      },
    });
  }

  syncSelectedUser(): void {
    const email = this.ownerEmail?.trim().toLowerCase();
    if (!email) {
      this.selectedUser = this.userOptions[0] || null;
      return;
    }
    let found = this.userOptions.find((u) => u.email.toLowerCase() === email);
    if (!found) {
      found = { label: email, email };
      this.userOptions = [...this.userOptions, found];
    }
    this.selectedUser = found;
  }

  onUserSelect(option: UserOption | null): void {
    this.selectedUser = option;
    this.ownerEmail = option?.email || '';
  }

  private syncFromInputs(): void {
    const fallbackTitle =
      this.initialTitle?.trim() ||
      this.initialHumanName?.trim() ||
      this.initialSourceTitle?.trim() ||
      '';
    if (!this.titleInitialized || !this.title?.trim()) {
      this.title = fallbackTitle;
      this.titleInitialized = true;
    }
    this.sourceTitle = this.initialSourceTitle?.trim() || '';
    this.language = this.initialLanguage?.trim() || 'ru';
    this.version = this.initialVersion?.trim() || '';
    this.ownerEmail = this.initialOwnerEmail?.trim() || '';
    this.isDefault = !!this.initialIsDefault;
    this.isClassicBookOrder = !!this.initialIsClassicBookOrder;
    this.coverImage = this.initialCoverImage || '';

    const foundLang = findLanguage(this.language);
    if (foundLang) {
      this.selectedLanguage = foundLang;
      this.isManualLanguage = false;
    } else {
      this.selectedLanguage = null;
      this.isManualLanguage = true;
    }

    if (this.language) {
      this.selectedCountry = findFlagByLanguage(this.language) ?? null;
      if (!this.coverImage && this.selectedCountry) {
        void this.onCountryChange(this.selectedCountry);
      }
    }
  }

  onSubmit(): void {
    if (!this.title?.trim()) {
      this.errorMessage = 'Название не может быть пустым';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    const titleVal = this.title.trim();
    const payload: UpdateBibleMetaDto = {
      title: titleVal,
      humanName: titleVal,
      sourceTitle: this.sourceTitle?.trim() || titleVal,
      language: this.language?.trim() || 'ru',
      version: this.version?.trim() || '',
      isDefault: this.isDefault,
      isClassicBookOrder: this.isClassicBookOrder,
      coverImage: this.coverImage,
      ownerEmail: this.ownerEmail?.trim() || '',
    };

    this.api.updateMeta(this.bibleId, payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.completed.emit(payload);
      },
      error: (err: unknown) => {
        this.isSaving = false;
        this.errorMessage =
          (err as { message?: string })?.message || 'Ошибка обновления метаданных';
      },
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
