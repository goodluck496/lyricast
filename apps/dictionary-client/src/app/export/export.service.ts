import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

type ExportFormat = 'json' | 'sqlite';
type ExportStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ExportJobView {
  jobId: string;
  songBookId: number;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  downloadUrl: string | null;
  error: string | null;
  label?: string;
}

interface CreateExportResponse {
  jobId: string;
}

interface ExportJobResponse {
  jobId: string;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  error: string | null;
  downloadUrl: string | null;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly apiBase = `${environment.API_URL}/api/songs`;
  private readonly jobs$ = new BehaviorSubject<ExportJobView[]>([]);
  private readonly polls = new Map<string, Subscription>();

  constructor(private readonly http: HttpClient) {}

  readonly jobsObservable = this.jobs$.asObservable();

  startJsonExport(songBookId: number, label?: string) {
    return this.startExport('json', songBookId, label);
  }

  startSqliteExport(songBookId: number, label?: string) {
    return this.startExport('sqlite', songBookId, label);
  }

  removeJob(jobId: string) {
    this.stopPolling(jobId);
    this.jobs$.next(this.jobs$.value.filter((j) => j.jobId !== jobId));
  }

  openDownload(jobId: string) {
    const job = this.jobs$.value.find((j) => j.jobId === jobId);
    if (!job || !job.downloadUrl) return;
    const url = job.downloadUrl.startsWith('http')
      ? job.downloadUrl
      : `${environment.API_URL}${job.downloadUrl}`;

    this.http
      .get(url, { responseType: 'blob', observe: 'response' })
      .subscribe({
        next: (res) => {
          const fileName = this.extractFileName(res.headers.get('content-disposition')) ?? job.label ?? 'export';
          const blob = res.body ?? new Blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fileName;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.click();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        },
        error: (err) => {
          this.markFailed(jobId, err);
        },
      });
  }

  cancel(jobId: string) {
    const job = this.jobs$.value.find((j) => j.jobId === jobId);
    if (!job) return;
    if (job.status === 'done' || job.status === 'failed') {
      this.removeJob(jobId);
      return;
    }

    const endpoint = `${this.apiBase}/export-jobs/${jobId}/cancel`;
    this.http.post<{ ok: boolean; status: ExportStatus }>(endpoint, {}).subscribe({
      next: () => {
        this.stopPolling(jobId);
        this.jobs$.next(
          this.jobs$.value.map((j) =>
            j.jobId === jobId ? { ...j, status: 'cancelled' as ExportStatus, progress: 100, error: null } : j,
          ),
        );
      },
      error: (err) => this.markFailed(jobId, err),
    });
  }

  private extractFileName(contentDisposition: string | null): string | null {
    if (!contentDisposition) return null;
    const matches = /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(contentDisposition);
    if (!matches || matches.length < 2) return null;
    try {
      return decodeURIComponent(matches[1]);
    } catch {
      return matches[1];
    }
  }

  private startExport(format: ExportFormat, songBookId: number, label?: string) {
    const jobs = this.jobs$.value;
    const provisionalId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const newJob: ExportJobView = {
      jobId: provisionalId,
      songBookId,
      format,
      status: 'pending',
      progress: 0,
      downloadUrl: null,
      error: null,
      label,
    };
    this.jobs$.next([...jobs, newJob]);

    const endpoint =
      format === 'json'
        ? `${this.apiBase}/song-books/${songBookId}/export-json`
        : `${this.apiBase}/song-books/${songBookId}/export-sqlite`;

    this.http.post<CreateExportResponse>(endpoint, {}).subscribe({
      next: (res) => {
        const jobId = res.jobId;
        this.replaceJobId(provisionalId, jobId);
        this.startPolling(jobId);
      },
      error: (err) => {
        this.markFailed(provisionalId, err);
      },
    });
  }

  private replaceJobId(tempId: string, realId: string) {
    const updated = this.jobs$.value.map((j) => (j.jobId === tempId ? { ...j, jobId: realId } : j));
    this.jobs$.next(updated);
  }

  private markFailed(jobId: string, err: unknown) {
    const message =
      err && typeof err === 'object' && 'message' in err ? String((err as any).message) : 'Ошибка экспорта';
    const updated = this.jobs$.value.map((j) =>
      j.jobId === jobId ? { ...j, status: 'failed' as ExportStatus, progress: 100, error: message } : j,
    );
    this.jobs$.next(updated);
    this.stopPolling(jobId);
  }

  private startPolling(jobId: string) {
    if (this.polls.has(jobId)) return;
    const sub = timer(0, 2000)
      .pipe(
        switchMap(() => this.http.get<ExportJobResponse>(`${this.apiBase}/export-jobs/${jobId}`)),
        catchError((err) => {
          this.markFailed(jobId, err);
          throw err;
        }),
      )
      .subscribe((res) => {
        const updated = this.jobs$.value.map((j) =>
          j.jobId === jobId
            ? {
                ...j,
                status: res.status,
                progress: res.progress,
                downloadUrl: res.downloadUrl,
                error: res.error,
                format: res.format,
              }
            : j,
        );
        this.jobs$.next(updated);

        if (res.status === 'done' || res.status === 'failed' || res.status === 'cancelled') {
          this.stopPolling(jobId);
        }
      });

    this.polls.set(jobId, sub);
  }

  private stopPolling(jobId: string) {
    const sub = this.polls.get(jobId);
    if (sub) {
      sub.unsubscribe();
      this.polls.delete(jobId);
    }
  }
}
