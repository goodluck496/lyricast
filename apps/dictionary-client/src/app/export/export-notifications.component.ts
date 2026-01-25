import { AsyncPipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ProgressBarModule } from 'primeng/progressbar';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { ConfirmationService } from 'primeng/api';
import { ExportJobView, ExportService } from './export.service';

@Component({
  selector: 'lyri-export-notifications',
  standalone: true,
  imports: [AsyncPipe, NgClass, ProgressBarModule, ButtonModule, TagModule, ConfirmPopupModule],
  templateUrl: './export-notifications.component.html',
  styleUrl: './export-notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService]
})
export class ExportNotificationsComponent {
  private readonly exportService = inject(ExportService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly jobs$ = this.exportService.jobsObservable;

  formatLabel(job: ExportJobView): string {
    const base = job.format === 'json' ? 'JSON' : 'SQLite';
    return job.label ? `${base} — ${job.label}` : base;
  }

  statusSeverity(job: ExportJobView): 'info' | 'success' | 'danger' | 'warn' {
    if (job.status === 'done') return 'success';
    if (job.status === 'failed' || job.status === 'cancelled') return 'danger';
    if (job.status === 'pending') return 'warn';
    return 'info';
  }

  statusLabel(job: ExportJobView): string {
    switch (job.status) {
      case 'pending':
        return 'В очереди';
      case 'running':
        return 'В процессе';
      case 'done':
        return 'Готово';
      case 'failed':
        return 'Ошибка';
      case 'cancelled':
        return 'Отменено';
      default:
        return job.status;
    }
  }

  progressStyles(job: ExportJobView) {
    const styles: Record<string, string> = { height: '20px' };
    if (job.status === 'cancelled') {
      styles['--p-progressbar-value-bg'] = 'var(--red-500, #d32f2f)';
    } else if (job.status === 'failed') {
      styles['--p-progressbar-value-bg'] = 'var(--red-600, #c62828)';
    }
    return styles;
  }

  progressClass(job: ExportJobView): string {
    return `export-card__progress export-card__progress--${job.status}`;
  }

  onDownload(job: ExportJobView) {
    this.exportService.openDownload(job.jobId);
  }

  onClose(event: Event, job: ExportJobView) {
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
      this.exportService.removeJob(job.jobId);
      return;
    }

    this.confirmationService.confirm({
      target: event.currentTarget as HTMLElement,
      message: 'Остановить экспорт и удалить временный файл?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Да, остановить',
      rejectLabel: 'Отмена',
      accept: () => this.exportService.cancel(job.jobId),
    });
  }
}
