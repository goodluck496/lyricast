import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { ConfirmationService, SharedModule } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ButtonDirective, ButtonIcon, ButtonLabel, ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';

import { BibleDictionaryCardDto, SongDatabaseInfoDto } from '@lyri-cast/entities';
import { SongDictionaryCardComponent } from '@lyri-cast/ui-lib';
import { BibleApiService } from '@lyri-cast/data-access-bible';

@Component({
  selector: 'lyri-bible-dictionaries-manager',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AccordionModule,
    ConfirmPopup,
    ProgressSpinnerModule,
    SkeletonModule,
    ButtonModule,
    ButtonDirective,
    ButtonLabel,
    ButtonIcon,
    ProgressBarModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SongDictionaryCardComponent,
    SharedModule,
  ],
  templateUrl: './bible-dictionaries-manager.component.html',
  styleUrl: './bible-dictionaries-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleDictionariesManagerComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly bibleApi = inject(BibleApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly destroy$ = new Subject<void>();

  @Input() title = 'Переводы Библии';
  @Input() autoLoad = true;

  @Output() changed = new EventEmitter<void>();

  searchQuery = '';
  bibleDictionaries: BibleDictionaryCardDto[] = [];
  bibleDictionariesLoading = false;
  bibleDictionaryBusyByKey: Record<string, boolean> = {};
  downloadProgressByKey: Record<string, number> = {};
  bibleDictionariesClearBusy = false;
  readonly skeletonItems = Array.from({ length: 4 });

  get filteredDictionaries(): BibleDictionaryCardDto[] {
    if (!this.searchQuery.trim()) {
      return this.bibleDictionaries;
    }
    const q = this.searchQuery.toLowerCase().trim();
    return this.bibleDictionaries.filter(
      (b) =>
        b.title?.toLowerCase().includes(q) ||
        b.fileKey?.toLowerCase().includes(q) ||
        b.language?.toLowerCase().includes(q) ||
        b.sourceTitle?.toLowerCase().includes(q)
    );
  }

  async ngOnInit(): Promise<void> {
    if (this.autoLoad) {
      await this.reloadBibleDictionaries();
    }
  }

  ngOnDestroy(): void {
    this.confirmationService.close();
    this.destroy$.next();
    this.destroy$.complete();
  }

  toDatabaseInfo(card: BibleDictionaryCardDto): SongDatabaseInfoDto {
    return {
      db: card.fileKey,
      fileKey: card.fileKey,
      title: card.title,
      language: card.language,
      coverImage: card.coverImage,
      sizeBytes: card.sizeBytes,
      songCount: card.bookCount ?? 66,
      version: card.remoteVersion ?? card.localVersion,
      localVersion: card.localVersion,
      updatedAt: undefined,
      updatedBy: undefined,
    };
  }

  async reloadBibleDictionaries(): Promise<void> {
    this.bibleDictionariesLoading = true;
    this.cdr.detectChanges();
    try {
      const result = await firstValueFrom(this.bibleApi.getDictionaries());
      if (Array.isArray(result)) {
        this.bibleDictionaries = result;
      }
    } catch (e) {
      console.warn('Failed to load bible dictionaries', e);
      this.bibleDictionaries = [];
    } finally {
      this.bibleDictionariesLoading = false;
      this.cdr.detectChanges();
    }
  }

  onReloadBibleDictionaries(event: Event): void {
    event.stopPropagation();
    void this.reloadBibleDictionaries();
  }

  onClearBibleDictionaries(event: Event): void {
    event.stopPropagation();
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
    this.confirmationService.confirm({
      key: 'bible-dicts',
      target,
      message: 'Удалить все установленные переводы Библии (кроме Синодального)?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Удалить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => {
        void this.clearBibleDictionaries();
      },
    });
  }

  private async clearBibleDictionaries(): Promise<void> {
    this.bibleDictionariesClearBusy = true;
    this.cdr.detectChanges();
    try {
      await firstValueFrom(this.bibleApi.clearDictionaries());
      await this.reloadBibleDictionaries();
      this.changed.emit();
    } catch (e) {
      console.error('Failed to clear bible dictionaries', e);
    } finally {
      this.bibleDictionariesClearBusy = false;
      this.cdr.detectChanges();
    }
  }

  onInstallOrUpdateDictionary(event: Event, card: BibleDictionaryCardDto): void {
    event.stopPropagation();
    void this.installOrUpdateDictionary(card);
  }

  private async installOrUpdateDictionary(card: BibleDictionaryCardDto): Promise<void> {
    this.bibleDictionaryBusyByKey[card.fileKey] = true;
    this.downloadProgressByKey[card.fileKey] = 8;
    this.cdr.detectChanges();

    const progressTimer = setInterval(() => {
      const cur = this.downloadProgressByKey[card.fileKey] ?? 0;
      if (cur < 88) {
        this.downloadProgressByKey[card.fileKey] = cur + Math.floor(Math.random() * 12) + 6;
        this.cdr.detectChanges();
      }
    }, 250);

    try {
      await firstValueFrom(
        this.bibleApi.installDictionary({ fileKey: card.fileKey })
      );
      this.downloadProgressByKey[card.fileKey] = 100;
      this.cdr.detectChanges();
      await this.reloadBibleDictionaries();
      this.changed.emit();
    } catch (e) {
      console.error('Failed to install bible dictionary', e);
    } finally {
      clearInterval(progressTimer);
      delete this.downloadProgressByKey[card.fileKey];
      this.bibleDictionaryBusyByKey[card.fileKey] = false;
      this.cdr.detectChanges();
    }
  }

  onDeleteDictionary(event: Event, card: BibleDictionaryCardDto): void {
    event.stopPropagation();
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
    this.confirmationService.confirm({
      key: 'bible-dicts',
      target,
      message: `Удалить перевод «${card.title}»?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Удалить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => {
        void this.deleteDictionary(card);
      },
    });
  }

  private async deleteDictionary(card: BibleDictionaryCardDto): Promise<void> {
    this.bibleDictionaryBusyByKey[card.fileKey] = true;
    this.cdr.detectChanges();
    try {
      await firstValueFrom(
        this.bibleApi.deleteDictionary({ fileKey: card.fileKey })
      );
      await this.reloadBibleDictionaries();
      this.changed.emit();
    } catch (e) {
      console.error('Failed to delete bible dictionary', e);
    } finally {
      this.bibleDictionaryBusyByKey[card.fileKey] = false;
      this.cdr.detectChanges();
    }
  }
}
