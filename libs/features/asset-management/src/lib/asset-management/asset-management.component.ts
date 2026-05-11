import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ToolbarModule } from 'primeng/toolbar';
import { FileUploadHandlerEvent, FileUploadModule } from 'primeng/fileupload';
import { GalleriaModule } from 'primeng/galleria';
import { AssetsApiService } from '@lyri-cast/shared-browser/data-access/assets';
import { FreeSlideApiService } from '@lyri-cast/shared-browser/data-access/free-slide';
import { AssetDto, Presentation } from '@lyri-cast/entities';
import { Observable, forkJoin, map, switchMap, tap } from 'rxjs';
import { AssetClipboardService } from './asset-clipboard.service';
import { RouterModule } from '@angular/router';
import { FreeSlidePages, Pages } from '@lyri-cast/common-browser';

type AssetGalleryItem = {
  asset: AssetDto;
  alt: string;
  itemImageSrc: string;
  thumbnailImageSrc: string;
  title: string;
};

type AssetReferenceKind = 'preview' | 'content';

type AssetReference = {
  key: string;
  kind: AssetReferenceKind;
  presentationTitle: string;
  slideName: string;
  routerLink: Array<string | Pages | FreeSlidePages>;
};

@Component({
  selector: 'lyri-asset-management',
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
    FileUploadModule,
    GalleriaModule,
    RouterModule,
  ],
  providers: [AssetClipboardService, ConfirmationService, MessageService],
  templateUrl: './asset-management.component.html',
  styleUrl: './asset-management.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetManagementComponent implements OnInit {
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly freeSlideApiService = inject(FreeSlideApiService);
  private readonly assetClipboardService = inject(AssetClipboardService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  assets = signal<AssetDto[]>([]);
  galleryItems = signal<AssetGalleryItem[]>([]);
  assetReferences = signal<Map<string, AssetReference[]>>(new Map());
  selectedAssets: AssetDto[] = [];
  loading = signal(false);
  galleryVisible = signal(false);
  galleryActiveIndex = signal(0);
  readonly galleryResponsiveOptions = [
    {
      breakpoint: '1200px',
      numVisible: 5,
    },
    {
      breakpoint: '768px',
      numVisible: 3,
    },
    {
      breakpoint: '560px',
      numVisible: 1,
    },
  ];

  ngOnInit() {
    this.loadAssets();
  }

  loadAssets() {
    this.loading.set(true);
    this.selectedAssets = [];
    forkJoin({
      assets: this.assetsApiService.getAssets(),
      presentations: this.freeSlideApiService.getAll(),
    }).subscribe({
      next: ({ assets, presentations }) => {
        this.assets.set(assets);
        this.galleryItems.set(this.toGalleryItems(assets));
        this.assetReferences.set(this.collectAssetReferences(presentations));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Load failed',
          detail: 'Unable to load assets.',
          life: 5000,
        });
      },
    });
  }

  getAssetUrl(asset: AssetDto): string {
    return this.assetsApiService.getAssetUrl(asset.id);
  }

  isImageAsset(asset: AssetDto): boolean {
    return asset.mimeType.startsWith('image/');
  }

  openGallery(asset: AssetDto): void {
    const index = this.galleryItems().findIndex(
      (item) => item.asset.id === asset.id
    );

    if (index < 0) {
      return;
    }

    this.galleryActiveIndex.set(index);
    this.galleryVisible.set(true);
  }

  getAssetReferences(assetId: string): AssetReference[] {
    return this.assetReferences().get(assetId) ?? [];
  }

  getAssetReferenceLabel(reference: AssetReference): string {
    const kind = reference.kind === 'preview' ? 'preview' : 'content';
    return `${reference.presentationTitle} / ${reference.slideName} (${kind})`;
  }

  activeGalleryItem(): AssetGalleryItem | undefined {
    return this.galleryItems()[this.galleryActiveIndex()];
  }

  onGalleryActiveIndexChange(index: number): void {
    this.galleryActiveIndex.set(index);
  }

  onGalleryVisibleChange(visible: boolean): void {
    this.galleryVisible.set(visible);
  }

  showPreviousGalleryItem(): void {
    this.setGalleryActiveIndex(this.galleryActiveIndex() - 1);
  }

  showNextGalleryItem(): void {
    this.setGalleryActiveIndex(this.galleryActiveIndex() + 1);
  }

  selectGalleryItem(item: AssetGalleryItem): void {
    const index = this.galleryItems().findIndex(
      (galleryItem) => galleryItem.asset.id === item.asset.id
    );

    if (index >= 0) {
      this.galleryActiveIndex.set(index);
    }
  }

  async copyAssetImage(asset: AssetDto): Promise<void> {
    if (!this.isImageAsset(asset)) {
      return;
    }

    try {
      await this.assetClipboardService.copyImage(
        this.getAssetUrl(asset),
        asset.mimeType
      );
      this.messageService.add({
        severity: 'success',
        summary: 'Copied',
        detail: `${asset.originalName} copied to clipboard.`,
        life: 3000,
      });
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Copy failed',
        detail:
          error instanceof Error
            ? error.message
            : 'Unable to copy image to clipboard.',
        life: 5000,
      });
    }
  }

  onUpload(event: FileUploadHandlerEvent) {
    const files = event.files;
    if (!files || files.length === 0) {
      return;
    }

    console.log('files', files);
    const uploadObservables = files.map((file) =>
      this.assetsApiService.uploadAsset(file)
    );

    forkJoin(uploadObservables).subscribe(() => {
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `${files.length} file(s) uploaded.`,
        life: 3000,
      });
      this.loadAssets(); // Refresh the list
    });
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

  confirmDeleteUnusedAssets(): void {
    this.loading.set(true);

    forkJoin({
      assets: this.assetsApiService.getAssets(),
      presentations: this.freeSlideApiService.getAll(),
    }).subscribe({
      next: ({ assets, presentations }) => {
        this.assets.set(assets);
        this.galleryItems.set(this.toGalleryItems(assets));
        this.assetReferences.set(this.collectAssetReferences(presentations));
        this.loading.set(false);

        const usedAssetIds = this.collectUsedAssetIds(presentations);
        const unusedAssets = assets.filter(
          (asset) => !usedAssetIds.has(asset.id)
        );

        if (unusedAssets.length === 0) {
          this.messageService.add({
            severity: 'info',
            summary: 'Nothing to delete',
            detail: 'There are no unused assets.',
            life: 3000,
          });
          return;
        }

        this.confirmationService.confirm({
          message: `Delete ${unusedAssets.length} assets that are not linked to any presentation slide?`,
          header: 'Delete Unused Assets',
          icon: 'pi pi-info-circle',
          accept: () => {
            this.deleteUnusedAssets(unusedAssets);
          },
        });
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Scan failed',
          detail: 'Unable to find unused assets.',
          life: 5000,
        });
      },
    });
  }

  confirmDeleteAsset(asset: AssetDto): void {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete "${asset.originalName}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-info-circle',
      accept: () => {
        this.deleteAsset(asset);
      },
    });
  }

  deleteSelectedAssets() {
    const idsToDelete = this.selectedAssets.map((a) => a.id);
    if (idsToDelete.length === 0) {
      return;
    }

    const deleteObservables = idsToDelete.map((id) =>
      this.assetsApiService.deleteAsset(id)
    );

    forkJoin(deleteObservables)
      .pipe(
        switchMap(() => {
          this.messageService.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `${idsToDelete.length} assets deleted.`,
            life: 3000,
          });
          return this.refreshAssets();
        })
      )
      .subscribe(() => {
        this.selectedAssets = [];
      });
  }

  private deleteUnusedAssets(unusedAssets: AssetDto[]): void {
    const idsToDelete = unusedAssets.map((asset) => asset.id);

    if (idsToDelete.length === 0) {
      return;
    }

    const deletedIds = new Set(idsToDelete);
    const deleteObservables = idsToDelete.map((id) =>
      this.assetsApiService.deleteAsset(id)
    );

    this.loading.set(true);
    forkJoin(deleteObservables)
      .pipe(
        switchMap(() => {
          this.messageService.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `${idsToDelete.length} unused assets deleted.`,
            life: 3000,
          });
          return this.refreshAssets();
        })
      )
      .subscribe({
        next: () => {
          this.selectedAssets = this.selectedAssets.filter(
            (asset) => !deletedIds.has(asset.id)
          );
          this.normalizeGalleryAfterBulkDelete();
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Delete failed',
            detail: 'Unable to delete unused assets.',
            life: 5000,
          });
        },
      });
  }

  formatBytes(bytes: number, decimals = 2): string {
    if (!+bytes) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  private toGalleryItems(assets: AssetDto[]): AssetGalleryItem[] {
    return assets
      .filter((asset) => this.isImageAsset(asset))
      .map((asset) => this.toGalleryItem(asset));
  }

  private deleteAsset(asset: AssetDto): void {
    const deletedGalleryIndex = this.galleryItems().findIndex(
      (item) => item.asset.id === asset.id
    );

    this.assetsApiService
      .deleteAsset(asset.id)
      .pipe(
        switchMap(() => {
          this.messageService.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `${asset.originalName} deleted.`,
            life: 3000,
          });
          return this.refreshAssets();
        })
      )
      .subscribe(() => {
        this.selectedAssets = this.selectedAssets.filter(
          (selectedAsset) => selectedAsset.id !== asset.id
        );
        this.normalizeGalleryAfterDelete(deletedGalleryIndex);
      });
  }

  private refreshAssets(): Observable<AssetDto[]> {
    return forkJoin({
      assets: this.assetsApiService.getAssets(),
      presentations: this.freeSlideApiService.getAll(),
    }).pipe(
      tap(({ assets, presentations }) => {
        this.assets.set(assets);
        this.galleryItems.set(this.toGalleryItems(assets));
        this.assetReferences.set(this.collectAssetReferences(presentations));
      }),
      map(({ assets }) => assets)
    );
  }

  private normalizeGalleryAfterDelete(deletedGalleryIndex: number): void {
    const itemsCount = this.galleryItems().length;

    if (itemsCount === 0) {
      this.galleryVisible.set(false);
      this.galleryActiveIndex.set(0);
      return;
    }

    if (deletedGalleryIndex < 0) {
      return;
    }

    this.galleryActiveIndex.set(Math.min(deletedGalleryIndex, itemsCount - 1));
  }

  private normalizeGalleryAfterBulkDelete(): void {
    const itemsCount = this.galleryItems().length;

    if (itemsCount === 0) {
      this.galleryVisible.set(false);
      this.galleryActiveIndex.set(0);
      return;
    }

    if (this.galleryActiveIndex() >= itemsCount) {
      this.galleryActiveIndex.set(itemsCount - 1);
    }
  }

  private collectUsedAssetIds(presentations: Presentation[]): Set<string> {
    const usedAssetIds = new Set<string>();

    for (const presentation of presentations) {
      for (const slide of presentation.slides) {
        this.addAssetReference(slide.previewAssetId, usedAssetIds);

        try {
          this.collectAssetIdsFromValue(JSON.parse(slide.content), usedAssetIds);
        } catch {
          continue;
        }
      }
    }

    return usedAssetIds;
  }

  private collectAssetReferences(
    presentations: Presentation[]
  ): Map<string, AssetReference[]> {
    const references = new Map<string, AssetReference[]>();
    const seenReferences = new Set<string>();

    for (const presentation of presentations) {
      const presentationTitle = presentation.title || 'Untitled presentation';
      const routerLink = [
        '/',
        Pages.MAIN,
        Pages.FREE_SLIDE_FEATURE,
        FreeSlidePages.SLIDE,
        presentation.id,
      ];

      for (const slide of presentation.slides) {
        const slideName = slide.name || `Slide ${slide.index + 1}`;
        this.addAssetReferencesFromValue(
          slide.previewAssetId,
          {
            kind: 'preview',
            presentationTitle,
            slideName,
            routerLink,
          },
          references,
          seenReferences
        );

        try {
          this.collectAssetReferencesFromValue(
            JSON.parse(slide.content),
            {
              kind: 'content',
              presentationTitle,
              slideName,
              routerLink,
            },
            references,
            seenReferences
          );
        } catch {
          continue;
        }
      }
    }

    return references;
  }

  private collectAssetReferencesFromValue(
    value: unknown,
    meta: Omit<AssetReference, 'key'>,
    references: Map<string, AssetReference[]>,
    seenReferences: Set<string>
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectAssetReferencesFromValue(
          item,
          meta,
          references,
          seenReferences
        );
      }
      return;
    }

    if (!this.isRecord(value)) {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        (key === 'assetId' ||
          key === 'bgAssetId' ||
          key === 'backgroundImageUrl') &&
        typeof child === 'string'
      ) {
        this.addAssetReferencesFromValue(
          child,
          meta,
          references,
          seenReferences
        );
      }

      this.collectAssetReferencesFromValue(
        child,
        meta,
        references,
        seenReferences
      );
    }
  }

  private addAssetReferencesFromValue(
    value: string | undefined,
    meta: Omit<AssetReference, 'key'>,
    references: Map<string, AssetReference[]>,
    seenReferences: Set<string>
  ): void {
    for (const assetId of this.extractAssetIds(value)) {
      const key = [
        assetId,
        meta.kind,
        meta.routerLink.join('/'),
        meta.slideName,
      ].join('|');

      if (seenReferences.has(key)) {
        continue;
      }

      seenReferences.add(key);
      const currentReferences = references.get(assetId) ?? [];
      currentReferences.push({ ...meta, key });
      references.set(assetId, currentReferences);
    }
  }

  private collectAssetIdsFromValue(
    value: unknown,
    usedAssetIds: Set<string>
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectAssetIdsFromValue(item, usedAssetIds);
      }
      return;
    }

    if (!this.isRecord(value)) {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        (key === 'assetId' ||
          key === 'bgAssetId' ||
          key === 'backgroundImageUrl') &&
        typeof child === 'string'
      ) {
        this.addAssetReference(child, usedAssetIds);
      }

      this.collectAssetIdsFromValue(child, usedAssetIds);
    }
  }

  private addAssetReference(
    value: string | undefined,
    usedAssetIds: Set<string>
  ): void {
    for (const assetId of this.extractAssetIds(value)) {
      usedAssetIds.add(assetId);
    }
  }

  private extractAssetIds(value: string | undefined): Set<string> {
    const assetIds = new Set<string>();
    if (!value) {
      return assetIds;
    }

    if (/^[a-f0-9]{64}$/i.test(value)) {
      assetIds.add(value);
    }

    const match = value.match(
      /(?:assets\/|svc:\/\/assets\/)([a-f0-9]{64})(?:\/file)?/i
    );
    const referencedId = match?.[1];
    if (referencedId) {
      assetIds.add(referencedId);
    }

    return assetIds;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private setGalleryActiveIndex(index: number): void {
    const itemsCount = this.galleryItems().length;

    if (itemsCount === 0) {
      return;
    }

    if (index < 0) {
      this.galleryActiveIndex.set(itemsCount - 1);
      return;
    }

    if (index >= itemsCount) {
      this.galleryActiveIndex.set(0);
      return;
    }

    this.galleryActiveIndex.set(index);
  }

  private toGalleryItem(asset: AssetDto): AssetGalleryItem {
    const url = this.getAssetUrl(asset);

    return {
      asset,
      alt: asset.originalName,
      itemImageSrc: url,
      thumbnailImageSrc: url,
      title: asset.originalName,
    };
  }
}
