import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';

import {
  SongDictionaryCardDto,
  SongsApiService,
} from '@lyri-cast/data-access-songs';
import { SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { RouteReuseStrategy } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { CustomReuseStrategy } from '../../../services/common/router-reuse.strategy';

@Component({
  selector: 'lyri-song-dictionaries-manager',
  standalone: true,
  imports: [
    CommonModule,
    AccordionModule,
    ConfirmPopup,
    ProgressSpinnerModule,
    ButtonDirective,
    ButtonLabel,
    ButtonIcon,
    SongDictionaryCardComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './song-dictionaries-manager.component.html',
  styleUrl: './song-dictionaries-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongDictionariesManagerComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly songsApi = inject(SongsApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly routeReuse = inject(RouteReuseStrategy);

  @Input() title = 'Песни';
  @Input() autoLoad = false;

  @Output() authCancelled = new EventEmitter<void>();

  songDictionaries: SongDictionaryCardDto[] = [];
  songDictionariesLoading = false;
  songDictionaryBusyByKey: Record<string, boolean> = {};
  songDictionariesClearBusy = false;

  async ngOnInit() {
    if (this.autoLoad) {
      await this.reloadSongDictionaries();
    }
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
      updatedAt: card.updatedAt,
      updatedBy: card.updatedBy,
    };
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
    return this.handleCardOperation(
      card,
      () => this.songsApi.installSongDictionary({ fileKey: card.fileKey }),
      'Failed to install dictionary'
    );
  }
}
