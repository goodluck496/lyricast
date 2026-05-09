import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ProgressBarModule } from 'primeng/progressbar';

export type PptxStepStatus = 'pending' | 'active' | 'done' | 'error';

export type PptxProgressStep = {
  label: string;
  status: PptxStepStatus;
  details?: string;
};

export type PptxProgressState = {
  busy: boolean;
  fileName: string;
  percent: number;
  totalSlides?: number;
  processedSlides?: number;
  message: string;
  steps: PptxProgressStep[];
};

@Component({
  selector: 'lyri-pptx-progress-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, ProgressBarModule],
  templateUrl: './pptx-progress-dialog.component.html',
  styleUrl: './pptx-progress-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PptxProgressDialogComponent {
  header = input<string>('Прогресс');
  progress = input.required<PptxProgressState>();
  close = output<void>();

  onHide() {
    this.close.emit();
  }
}
