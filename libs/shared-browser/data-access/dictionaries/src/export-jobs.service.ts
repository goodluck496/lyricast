import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

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

export const DICTIONARIES_API_BASE = new InjectionToken<string | undefined>(
  'DICTIONARIES_API_BASE',
);

@Injectable({ providedIn: 'root' })
export class ExportJobsService {
  private readonly explicitBase = inject(DICTIONARIES_API_BASE, { optional: true });
  private readonly baseApiToken = inject(BASE_API_TOKEN, { optional: true });
  private readonly http = inject(HttpClient);

  private readonly jobs$ = new BehaviorSubject<ExportJobView[]>([]);
  private readonly polls = new Map<string, Subscription>();

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
      : `${this.resolveBaseUrl()}/${job.downloadUrl.replace(/^\/+/, '')}`;

    this.http
      .get(url, { responseType: 'blob', observe: 'response' })
      .subscribe({
        next: (res) => {
          const fileName =
            this.extractFileName(
              res.headers.get('content-disposition'),
            ) ?? job.label ?? 'export';
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

    const endpoint = this.buildUrl(`export-jobs/${jobId}/cancel`);
    this.http
      .post<{ ok: boolean; status: ExportStatus }>(endpoint, {})
      .subscribe({
        next: () => {
          this.stopPolling(jobId);
          this.jobs$.next(
            this.jobs$.value.map((j) =>
              j.jobId === jobId
                ? {
                    ...j,
                    status: 'cancelled' as ExportStatus,
                    progress: 100,
                    error: null,
                  }
                : j,
            ),
          );
        },
        error: (err) => this.markFailed(jobId, err),
      });
  }

  private startExport(format: ExportFormat, songBookId: number, label?: string) {
    const jobs = this.jobs$.value;
    const provisionalId = `local-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
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
        ? this.buildUrl(`song-books/${songBookId}/export-json`)
        : this.buildUrl(`song-books/${songBookId}/export-sqlite`);

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
    const updated = this.jobs$.value.map((j) =>
      j.jobId === tempId ? { ...j, jobId: realId } : j,
    );
    this.jobs$.next(updated);
  }

  private markFailed(jobId: string, err: unknown) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as any).message)
        : 'Ошибка экспорта';
    const updated = this.jobs$.value.map((j) =>
      j.jobId === jobId
        ? {
            ...j,
            status: 'failed' as ExportStatus,
            progress: 100,
            error: message,
          }
        : j,
    );
    this.jobs$.next(updated);
    this.stopPolling(jobId);
  }

  private startPolling(jobId: string) {
    if (this.polls.has(jobId)) return;
    const sub = timer(0, 2000)
      .pipe(
        switchMap(() =>
          this.http.get<ExportJobResponse>(this.buildUrl(`export-jobs/${jobId}`), {
            headers: this.buildHeaders(),
          }),
        ),
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

        if (
          res.status === 'done' ||
          res.status === 'failed' ||
          res.status === 'cancelled'
        ) {
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

  private extractFileName(contentDisposition: string | null): string | null {
    if (!contentDisposition) return null;
    const matches =
      /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(contentDisposition);
    if (!matches || matches.length < 2) return null;
    try {
      return decodeURIComponent(matches[1]);
    } catch {
      return matches[1];
    }
  }

  private buildHeaders(): HttpHeaders {
    return new HttpHeaders();
  }

  private buildUrl(path: string): string {
    const normalizedPath = path.replace(/^\/+/, '');
    const base = this.resolveBaseUrl();
    return `${base}/${normalizedPath}`;
  }

  private resolveBaseUrl(): string {
    if (this.explicitBase) {
      return this.explicitBase.replace(/\/+$/, '');
    }

    const rawBase = this.baseApiToken ?? '';
    if (!rawBase) {
      // fallback to relative, assumes proxy is configured
      return '/songs';
    }

    const trimmedBase = rawBase.replace(/\/+$/, '');
    const hasProtocolSuffix = rawBase.endsWith('://');
    return hasProtocolSuffix
      ? `${trimmedBase}songs`
      : `${trimmedBase}/songs`;
  }
}
