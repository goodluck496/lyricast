import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ConfirmationService, LazyLoadEvent, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { AssetStorageService } from '@lyri-cast/form';
import { TooltipModule } from 'primeng/tooltip';
import { ToolbarModule } from 'primeng/toolbar';
import { TableLazyLoadEvent } from 'primeng/table/table.interface';

// The AssetRecord type is internal to the service, so we redefine it here for type safety.
interface AssetRecord {
  id: string;
  mimeType: string;
  data: Blob;
  originalUrl?: string;
  timestamp: number;
}

interface DisplayAsset {
  id: string;
  url: SafeUrl;
  type: string;
  timestamp: number;
  blob: Blob;
  size: number;
}

@Component({
  selector: 'lyri-storage-management',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TableModule,
    ConfirmDialogModule,
    DatePipe,
    ToastModule,
    TooltipModule,
    ToolbarModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './storage-managment.component.html',
  styleUrl: './storage-managment.component.scss',
})
export class StorageManagementComponent implements OnInit, OnDestroy {
  private assetStorage = inject(AssetStorageService);
  private sanitizer = inject(DomSanitizer);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);

  allAssets: DisplayAsset[] = [];
  loadedAssets: DisplayAsset[] = [];
  selectedAssets: DisplayAsset[] = [];
  totalRecords = 0;
  loading = false;

  private objectUrls: string[] = [];

  totalUsage = 0;
  totalQuota = 0;

  ngOnInit() {
    this.loadInitialAssets();
  }

  ngOnDestroy() {
    // Clean up object URLs to prevent memory leaks
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  async loadInitialAssets() {
    this.loading = true;
    this.selectedAssets = [];
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls = [];

    const allAssetRecords = await this.assetStorage.getAllAssets();
    this.allAssets = allAssetRecords.map((assetRecord: AssetRecord) => ({
      id: assetRecord.id,
      url: '' as any, // Will be created on-demand
      type: assetRecord.mimeType,
      timestamp: assetRecord.timestamp,
      blob: assetRecord.data,
      size: assetRecord.data.size,
    }));
    this.totalRecords = this.allAssets.length;
    this.loadedAssets = Array.from({ length: this.totalRecords });

    // Manually calculate usage for accuracy, as the estimate can be stale.
    this.totalUsage = this.allAssets.reduce((sum, asset) => sum + asset.size, 0);

    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      this.totalQuota = estimate.quota || 0;
    }
    this.loading = false;
  }

  loadAssetsChunk(event: TableLazyLoadEvent) {
    this.loading = true;
    const { first, last } = event;
    if (first === undefined || last === undefined) return;

    const chunk = this.allAssets.slice(first, last);

    chunk.forEach((asset) => {
      if (!asset.url) {
        const url = URL.createObjectURL(asset.blob);
        this.objectUrls.push(url);
        asset.url = this.sanitizer.bypassSecurityTrustUrl(url);
      }
    });

    const newLoadedAssets = [...this.loadedAssets];
    newLoadedAssets.splice(first, chunk.length, ...chunk);
    this.loadedAssets = newLoadedAssets;
    this.loading = false;
  }

  copyAssetToClipboard(asset: DisplayAsset) {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result;
      if (base64data) {
        navigator.clipboard
          .writeText(base64data as string)
          .then(() => {
            this.messageService.add({
              severity: 'success',
              summary: 'Copied',
              detail: 'Asset content copied to clipboard as Data URL.',
              life: 3000,
            });
          })
          .catch((err) => {
            console.error('Failed to copy to clipboard:', err);
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'Could not copy to clipboard.',
              life: 3000,
            });
          });
      }
    };
    reader.readAsDataURL(asset.blob);
  }

  confirmClearAll() {
    this.confirmationService.confirm({
      message:
        'Are you sure you want to delete all stored assets? This cannot be undone.',
      header: 'Delete Confirmation',
      icon: 'pi pi-info-circle',
      accept: () => {
        this.clearAllAssets();
      },
    });
  }

  async clearAllAssets() {
    await this.assetStorage.clearAllAssets();
    this.loadInitialAssets();
  }

  confirmDeleteSelected() {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete ${this.selectedAssets.length} selected assets?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-info-circle',
      accept: () => {
        this.deleteSelectedAssets();
      },
    });
  }

  async deleteSelectedAssets() {
    console.log(this.selectedAssets);
    const idsToDelete = this.selectedAssets.map((a) => a.id);
    await Promise.all(
      idsToDelete.map((id) => this.assetStorage.deleteAsset(id))
    );

    this.messageService.add({
      severity: 'success',
      summary: 'Deleted',
      detail: `${idsToDelete.length} assets deleted.`,
      life: 3000,
    });

    await this.loadInitialAssets();
  }

  formatBytes(bytes: number, decimals = 2): string {
    if (!+bytes) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  getUsagePercentage(): string {
    if (!this.totalQuota) return '0';
    const percentage = (this.totalUsage / this.totalQuota) * 100;
    return percentage.toFixed(1);
  }
}

