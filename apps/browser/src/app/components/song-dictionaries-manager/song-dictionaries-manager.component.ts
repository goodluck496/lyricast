import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  OnDestroy,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';

import {
  SongDictionaryCardDto,
  SongsApiService,
} from '@lyri-cast/data-access-songs';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { RouteReuseStrategy } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { CustomReuseStrategy } from '../../../services/common/router-reuse.strategy';
import {
  ExportJobView,
  ExportJobsService,
} from '@lyri-cast/shared-browser/data-access/dictionaries';

@Component({
  selector: 'lyri-song-dictionaries-manager',
  standalone: true,
  imports: [
    CommonModule,
    AccordionModule,
    ConfirmPopup,
    ProgressSpinnerModule,
    SkeletonModule,
    ButtonDirective,
    ButtonLabel,
    ButtonIcon,
    ProgressBarModule,
    SongDictionaryCardComponent,
  ],
  templateUrl: './song-dictionaries-manager.component.html',
  styleUrl: './song-dictionaries-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongDictionariesManagerComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly songsApi = inject(SongsApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly routeReuse = inject(RouteReuseStrategy);
  private readonly exportJobs = inject(ExportJobsService);
  private readonly destroy$ = new Subject<void>();

  @Input() title = 'Песни';
  @Input() autoLoad = false;

  @Output() authCancelled = new EventEmitter<void>();

  songDictionaries: SongDictionaryCardDto[] = [];
  songDictionariesLoading = false;
  songDictionaryBusyByKey: Record<string, boolean> = {};
  songDictionariesClearBusy = false;
  jobBySongBookId = new Map<number, ExportJobView>();
  private completedJobs = new Set<string>();
  private reloadingKeys = new Set<string>();
  readonly skeletonItems = Array.from({ length: 6 });

  async ngOnInit() {
    this.exportJobs.jobsObservable
      .pipe(takeUntil(this.destroy$))
      .subscribe((jobs) => {
        this.jobBySongBookId = new Map(
          jobs
            .filter((job) => typeof job.songBookId === 'number')
            .map((job) => [job.songBookId as number, job]),
        );

        // при завершении работы по справочнику — обновляем список один раз
        jobs.forEach((job) => void this.processCompletedJob(job));

        this.cdr.detectChanges();
      });

    if (this.autoLoad) {
      await this.reloadSongDictionaries();
    }
  }

  ngOnDestroy(): void {
    this.confirmationService.close();
    this.destroy$.next();
    this.destroy$.complete();
  }

  toSongDatabaseInfo(card: SongDictionaryCardDto): SongDatabaseInfoDto {
    return {
      db: card.fileKey,
      title: card.title,
      language: card.language,
      coverImage: card.coverImage,
      sizeBytes: card.sizeBytes,
      songCount: card.songCount,
      version: card.remoteVersion ?? card.localVersion,
      localVersion: card.localVersion,
      updatedAt: card.updatedAt,
      updatedBy: card.updatedBy,
    };
  }

  getJobForCard(card: SongDictionaryCardDto): ExportJobView | null {
    const songBookId = card.songBookId;
    if (typeof songBookId !== 'number') return null;
    return this.jobBySongBookId.get(songBookId) ?? null;
  }

  async reloadSongDictionaries(): Promise<void> {
    return this.handleDictionaryOperation(
      () => this.songsApi.getSongDictionaries(),
      'Failed to load song dictionaries'
    );
  }

  private async handleDictionaryOperation(
    operation: () => any,
    errorMessage: string
  ): Promise<void> {
    this.songDictionariesLoading = true;
    this.cdr.detectChanges();
    try {
      const result = await firstValueFrom(operation());
      if (Array.isArray(result)) {
        this.songDictionaries = result;
      }
    } catch (e) {
      const msg = String((e as any)?.message ?? e);
      if (msg.includes('Login cancelled')) {
        this.handleAuthCancellation();
      }
      console.log(errorMessage, e);
      this.songDictionaries = [];
    } finally {
      this.songDictionariesLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async deleteDictionary(card: SongDictionaryCardDto): Promise<void> {
    return this.handleCardOperation(
      card,
      () => this.songsApi.deleteSongDictionary({ fileKey: card.fileKey }),
      'Failed to delete dictionary'
    );
  }

  private async clearSongDictionaries(): Promise<void> {
    return this.handleDictionaryOperation(
      () => this.songsApi.clearSongDictionaries(),
      'Failed to clear dictionaries'
    );
  }

  private async handleCardOperation(
    card: SongDictionaryCardDto,
    operation: () => any,
    errorMessage: string
  ): Promise<void> {
    this.songDictionaryBusyByKey[card.fileKey] = true;
    this.cdr.detectChanges();
    try {
      await firstValueFrom(operation());

      if (this.routeReuse instanceof CustomReuseStrategy) {
        this.routeReuse.clearByPathContains(Pages.SONGS);
      }

      await this.reloadSongDictionaries();
    } catch (e) {
      const msg = String((e as any)?.message ?? e);
      if (msg.includes('Login cancelled')) {
        this.handleAuthCancellation();
      }
      console.log(errorMessage, e);
    } finally {
      this.songDictionaryBusyByKey[card.fileKey] = false;
      this.cdr.detectChanges();
    }
  }

  private async processCompletedJob(job: ExportJobView): Promise<void> {
    const isFinished =
      job.status === 'done' || job.status === 'failed' || job.status === 'cancelled';
    if (!isFinished || this.completedJobs.has(job.jobId)) {
      return;
    }

    this.completedJobs.add(job.jobId);
    let reloadingKey: string | null = null;

    try {
      if (job.status === 'done' && job.downloadUrl) {
        const fileKey = await this.resolveFileKeyBySongBookId(job.songBookId);
        if (fileKey) {
          reloadingKey = fileKey;
          this.reloadingKeys.add(fileKey);
        }
        await this.installFromJob(job, fileKey ?? undefined);
      }
    } finally {
      this.exportJobs.removeJob(job.jobId);
      await this.reloadSongDictionaries();
      if (reloadingKey) {
        this.reloadingKeys.delete(reloadingKey);
      }
    }
  }

  private async installFromJob(job: ExportJobView, resolvedKey?: string): Promise<void> {
    if (typeof job.songBookId !== 'number') return;

    const fileKey =
      resolvedKey ?? (await this.resolveFileKeyBySongBookId(job.songBookId));
    if (!fileKey) return;

    // Скачиваем и кладём файл напрямую через воркерный API
    await firstValueFrom(
      this.songsApi.installSongDictionary({
        fileKey,
        downloadUrl: job.downloadUrl ?? undefined,
      }),
    );
  }

  private async resolveFileKeyBySongBookId(songBookId: number): Promise<string | null> {
    const existing = this.songDictionaries.find(
      (card) => card.songBookId === songBookId && card.fileKey,
    );
    if (existing?.fileKey) {
      return existing.fileKey;
    }

    const dictionaries = await firstValueFrom(this.songsApi.getSongDictionaries());
    const fromApi = Array.isArray(dictionaries)
      ? dictionaries.find((card) => card.songBookId === songBookId && card.fileKey)
      : null;
    return fromApi?.fileKey ?? null;
  }

  isCardReloading(card: SongDictionaryCardDto): boolean {
    return this.songDictionariesLoading && this.reloadingKeys.has(card.fileKey);
  }

  private handleAuthCancellation(): void {
    this.authCancelled.emit();
    this.songDictionaries = [];
    this.songDictionariesLoading = false;
    this.songDictionaryBusyByKey = {};
    this.songDictionariesClearBusy = false;
  }

  private showConfirmation(
    event: Event,
    message: string,
    acceptAction: () => void
  ): void {
    this.confirmationService.confirm({
      target: event.target as any,
      message,
      acceptLabel: 'Да',
      rejectLabel: 'Нет',
      rejectButtonProps: { severity: 'secondary' },
      acceptButtonProps: { severity: 'danger' },
      accept: acceptAction,
    });
  }

  onReloadSongDictionaries(event?: Event): void {
    event?.stopPropagation();
    void this.reloadSongDictionaries();
  }

  onClearSongDictionaries(event: Event): void {
    event.stopPropagation();
    this.showConfirmation(
      event,
      'Удалить все скачанные справочники?<br>Встроенные справочники удалены не будут.',
      () => void this.clearSongDictionaries()
    );
  }

  onDeleteDictionary(event: Event, card: SongDictionaryCardDto): void {
    event.stopPropagation();
    this.showConfirmation(
      event,
      `Удалить справочник "${card.title}"?`,
      () => void this.deleteDictionary(card)
    );
  }

  onInstallOrUpdateDictionary(event: Event, card: SongDictionaryCardDto): void {
    const actionLabel = card.isInstalled ? 'обновить' : 'установить';
    this.showConfirmation(
      event,
      `Вы уверены, что хотите ${actionLabel} справочник? <br> Загрузка может занять некоторое время.`,
      () => void this.installOrUpdateDictionary(card)
    );
  }

  private async installOrUpdateDictionary(
    card: SongDictionaryCardDto
  ): Promise<void> {
    // Новый API с job-идентификаторами по songBookId
    if (typeof card.songBookId === 'number') {
      const label = card.title || card.fileKey;
      this.exportJobs.startJsonExport(card.songBookId, label);
      return;
    }

    // Fallback на старое поведение, если нет songBookId
    return this.handleCardOperation(
      card,
      () => this.songsApi.installSongDictionary({ fileKey: card.fileKey }),
      'Failed to install dictionary'
    );
  }
}
