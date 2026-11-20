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
import {
  BiblesDictionaryApiService,
  UpdateBibleMetaDto,
} from '@lyri-cast/shared-browser/data-access/dictionaries';

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
  ],
  templateUrl: './bible-meta-dialog.component.html',
  styleUrl: './bible-meta-dialog.component.scss',
})
export class BibleMetaDialogComponent implements OnInit, OnChanges {
  private readonly api = inject(BiblesDictionaryApiService);

  @Input({ required: true }) bibleId!: number;
  @Input() initialTitle = '';
  @Input() initialHumanName = '';
  @Input() initialSourceTitle = '';
  @Input() initialLanguage = 'ru';
  @Input() initialVersion = '';
  @Input() initialIsDefault = false;
  @Input() initialIsClassicBookOrder = false;

  @Output() completed = new EventEmitter<UpdateBibleMetaDto>();
  @Output() cancelled = new EventEmitter<void>();

  title = '';
  sourceTitle = '';
  language = '';
  version = '';
  isDefault = false;
  isClassicBookOrder = false;

  isSaving = false;
  errorMessage = '';

  ngOnInit(): void {
    this.syncFromInputs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['initialTitle'] ||
      changes['initialHumanName'] ||
      changes['initialSourceTitle'] ||
      changes['initialLanguage'] ||
      changes['initialVersion'] ||
      changes['initialIsDefault'] ||
      changes['initialIsClassicBookOrder']
    ) {
      this.syncFromInputs();
    }
  }

  private syncFromInputs(): void {
    this.title = this.initialTitle || this.initialHumanName || this.initialSourceTitle || '';
    this.sourceTitle = this.initialSourceTitle || '';
    this.language = this.initialLanguage || 'ru';
    this.version = this.initialVersion || '';
    this.isDefault = !!this.initialIsDefault;
    this.isClassicBookOrder = !!this.initialIsClassicBookOrder;
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
