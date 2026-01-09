import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { FileUploadHandlerEvent, FileUploadModule } from 'primeng/fileupload';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { MetaDialogService, MetaFormState } from './meta-dialog.service';

@Component({
  standalone: true,
  selector: 'lyri-meta-dialog',
  templateUrl: './meta-dialog.component.html',
  styleUrl: './meta-dialog.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    FloatLabelModule,
    FileUploadModule,
    InputTextModule,
    TextareaModule,
    ButtonModule,
    SongDictionaryCardComponent,
  ],
})
export class MetaDialogComponent implements OnChanges {
  private service = inject(MetaDialogService);
  @Input({ required: true }) dbId!: string;
  @Input({ required: true }) currentDb: SongDatabaseInfoDto | null = null;
  @Input() visible = false;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  metaSaving = false;
  metaForm: MetaFormState = this.service.createForm(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentDb']) {
      this.metaForm = this.service.createForm(this.currentDb);
    }
  }

  get previewDb(): SongDatabaseInfoDto | null {
    return this.service.buildPreview(this.currentDb, this.metaForm);
  }

  onCoverUpload(event: FileUploadHandlerEvent): void {
    const file = event.files?.[0];
    if (!file) return;
    this.service
      .fileToDataUrl(file)
      .then((dataUrl) => (this.metaForm.coverImage = dataUrl));
  }

  onSave(): void {
    if (!this.currentDb) return;
    this.metaSaving = true;
    this.service.saveMeta(this.dbId, this.currentDb, this.metaForm).subscribe({
      next: () => {
        this.metaSaving = false;
        this.saved.emit();
      },
      error: () => {
        this.metaSaving = false;
      },
    });
  }

  onCancel(): void {
    this.closed.emit();
  }

  onEscape(event: Event): void {
    if (!this.visible) return;
    event.stopPropagation();
    event.preventDefault();
  }

  @HostListener('document:keydown.escape', ['$event'])
  blockEscape(event: Event): void {
    this.onEscape(event);
  }
}
