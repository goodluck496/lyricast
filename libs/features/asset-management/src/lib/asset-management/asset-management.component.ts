import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService, TreeNode } from 'primeng/api';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ToolbarModule } from 'primeng/toolbar';
import { FileUploadHandlerEvent, FileUploadModule } from 'primeng/fileupload';
import { GalleriaModule } from 'primeng/galleria';
import { TreeTableModule } from 'primeng/treetable';
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
  presentationId: string;
  presentationTitle: string;
  slideName: string;
  routerLink: Array<string | Pages | FreeSlidePages>;
};

type AssetTreePresentationRow = {
  type: 'presentation';
  id: string;
  name: string;
  assetsCount: number;
  slidesCount: number;
  createdAt: number;
};

type AssetTreeAssetRow = {
  type: 'asset';
  asset: AssetDto;
  references: AssetReference[];
};

type AssetTreeRow = AssetTreePresentationRow | AssetTreeAssetRow;

type TreeSelectionState = {
  checked?: boolean;
  partialChecked?: boolean;
};

@Component({
  selector: 'lyri-asset-management',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    ConfirmPopupModule,
    DatePipe,
    ToastModule,
    TooltipModule,
    ToolbarModule,
    FileUploadModule,
    GalleriaModule,
    TreeTableModule,
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
  assetTree = signal<TreeNode<AssetTreeRow>[]>([]);
  galleryItems = signal<AssetGalleryItem[]>([]);
  assetReferences = signal<Map<string, AssetReference[]>>(new Map());
  selectionKeys: Record<string, TreeSelectionState> = {};
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
    this.selectionKeys = {};
    forkJoin({
      assets: this.assetsApiService.getAssets(),
      presentations: this.freeSlideApiService.getAll(),
    }).subscribe({
      next: ({ assets, presentations }) => {
        this.assets.set(assets);
        this.galleryItems.set(this.toGalleryItems(assets));
        this.assetReferences.set(this.collectAssetReferences(presentations));
        this.assetTree.set(this.buildAssetTree(assets, presentations));
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

  getAssetReferenceShortLabel(reference: AssetReference): string {
    const kind = reference.kind === 'preview' ? 'preview' : 'content';
    return `${reference.slideName} (${kind})`;
  }

  getSelectedAssets(): AssetDto[] {
    const selectedAssets = new Map<string, AssetDto>();

    for (const node of this.assetTree()) {
      this.collectSelectedAssets(node, selectedAssets, false);
    }

    return Array.from(selectedAssets.values());
  }

  selectedAssetsCount(): number {
    return this.getSelectedAssets().length;
  }

  isPresentationRow(row: AssetTreeRow): row is AssetTreePresentationRow {
    return row.type === 'presentation';
  }

  isAssetRow(row: AssetTreeRow): row is AssetTreeAssetRow {
    return row.type === 'asset';
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

  confirmDeleteSelected(event: MouseEvent) {
    const selectedAssets = this.getSelectedAssets();

    this.confirmationService.confirm({
      key: 'popup',
      target: event.currentTarget ?? undefined,
      message: `Удалить выбранные вложения (${selectedAssets.length})? Действие нельзя отменить.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Удалить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.deleteSelectedAssets();
      },
    });
  }

  confirmDeleteUnusedAssets(event: MouseEvent): void {
    this.confirmationService.confirm({
      key: 'popup',
      target: event.currentTarget ?? undefined,
      message:
        'Вы точно хотите удалить все вложения, не привязанные к объектам? Действие нельзя отменить.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Удалить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.deleteUnusedAssetsAfterScan();
      },
    });
  }

  confirmDeleteAssetGroup(
    event: MouseEvent,
    group: AssetTreePresentationRow
  ): void {
    const groupAssets = this.getAssetsByGroupId(group.id);
    if (groupAssets.length === 0) {
      return;
    }

    this.confirmationService.confirm({
      key: 'popup',
      target: event.currentTarget ?? undefined,
      message:
        `Удалить ${groupAssets.length} вложений из хранилища для группы ` +
        `"${group.name}"? Если они используются в других местах, ссылки на них перестанут работать.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Удалить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.deleteAssetGroup(groupAssets);
      },
    });
  }

  private deleteUnusedAssetsAfterScan(): void {
    this.loading.set(true);

    forkJoin({
      assets: this.assetsApiService.getAssets(),
      presentations: this.freeSlideApiService.getAll(),
    }).subscribe({
      next: ({ assets, presentations }) => {
        this.assets.set(assets);
        this.galleryItems.set(this.toGalleryItems(assets));
        this.assetReferences.set(this.collectAssetReferences(presentations));
        this.assetTree.set(this.buildAssetTree(assets, presentations));
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

        this.deleteUnusedAssets(unusedAssets);
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

  confirmDeleteAsset(event: MouseEvent, asset: AssetDto): void {
    this.confirmationService.confirm({
      key: 'popup',
      target: event.currentTarget ?? undefined,
      message: `Удалить вложение "${asset.originalName}"? Действие нельзя отменить.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Удалить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.deleteAsset(asset);
      },
    });
  }

  deleteSelectedAssets() {
    const idsToDelete = this.getSelectedAssets().map((a) => a.id);
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
        this.selectionKeys = {};
      });
  }

  private deleteUnusedAssets(unusedAssets: AssetDto[]): void {
    this.deleteAssets(
      unusedAssets,
      `${unusedAssets.length} unused assets deleted.`,
      'Unable to delete unused assets.'
    );
  }

  private deleteAssetGroup(groupAssets: AssetDto[]): void {
    this.deleteAssets(
      groupAssets,
      `${groupAssets.length} group assets deleted.`,
      'Unable to delete asset group.'
    );
  }

  private deleteAssets(
    assets: AssetDto[],
    successDetail: string,
    errorDetail: string
  ): void {
    const idsToDelete = assets.map((asset) => asset.id);

    if (idsToDelete.length === 0) {
      return;
    }

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
            detail: successDetail,
            life: 3000,
          });
          return this.refreshAssets();
        })
      )
      .subscribe({
        next: () => {
          this.selectionKeys = {};
          this.normalizeGalleryAfterBulkDelete();
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Delete failed',
            detail: errorDetail,
            life: 5000,
          });
        },
      });
  }

  private getAssetsByGroupId(groupId: string): AssetDto[] {
    const groupNode = this.assetTree().find(
      (node) =>
        node.data &&
        this.isPresentationRow(node.data) &&
        node.data.id === groupId
    );
    const assets = new Map<string, AssetDto>();

    for (const child of groupNode?.children ?? []) {
      if (child.data && this.isAssetRow(child.data)) {
        assets.set(child.data.asset.id, child.data.asset);
      }
    }

    return Array.from(assets.values());
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
        this.removeSelectionKeysForAssets(new Set([asset.id]));
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
        this.assetTree.set(this.buildAssetTree(assets, presentations));
      }),
      map(({ assets }) => assets)
    );
  }

  private buildAssetTree(
    assets: AssetDto[],
    presentations: Presentation[]
  ): TreeNode<AssetTreeRow>[] {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const linkedAssetIds = new Set<string>();
    const nodes: TreeNode<AssetTreeRow>[] = [];

    for (const presentation of presentations) {
      const referencesByAsset =
        this.collectPresentationAssetReferences(presentation);
      const children = this.buildAssetChildNodes(
        presentation.id,
        referencesByAsset,
        assetsById,
        linkedAssetIds
      );

      if (children.length === 0) {
        continue;
      }

      nodes.push({
        key: this.getPresentationNodeKey(presentation.id),
        expanded: false,
        data: {
          type: 'presentation',
          id: presentation.id,
          name: presentation.title || 'Untitled presentation',
          assetsCount: children.length,
          slidesCount: presentation.slides.length,
          createdAt: presentation.createdAt,
        },
        children,
      });
    }

    const unlinkedAssets = assets.filter(
      (asset) => !linkedAssetIds.has(asset.id)
    );

    if (unlinkedAssets.length > 0) {
      nodes.push({
        key: this.getPresentationNodeKey('unlinked'),
        expanded: false,
        data: {
          type: 'presentation',
          id: 'unlinked',
          name: 'Not linked to presentations',
          assetsCount: unlinkedAssets.length,
          slidesCount: 0,
          createdAt: 0,
        },
        children: unlinkedAssets.map((asset) => ({
          key: this.getAssetNodeKey('unlinked', asset.id),
          data: {
            type: 'asset',
            asset,
            references: [],
          },
        })),
      });
    }

    return nodes;
  }

  private buildAssetChildNodes(
    presentationId: string,
    referencesByAsset: Map<string, AssetReference[]>,
    assetsById: Map<string, AssetDto>,
    linkedAssetIds: Set<string>
  ): TreeNode<AssetTreeRow>[] {
    const nodes: TreeNode<AssetTreeRow>[] = [];

    for (const [assetId, references] of referencesByAsset.entries()) {
      const asset = assetsById.get(assetId);
      if (!asset) {
        continue;
      }

      linkedAssetIds.add(asset.id);
      nodes.push({
        key: this.getAssetNodeKey(presentationId, asset.id),
        data: {
          type: 'asset',
          asset,
          references,
        },
      });
    }

    return nodes.sort((left, right) => {
      if (!left.data || !right.data) {
        return 0;
      }

      if (!this.isAssetRow(left.data) || !this.isAssetRow(right.data)) {
        return 0;
      }

      return left.data.asset.originalName.localeCompare(
        right.data.asset.originalName
      );
    });
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

    for (const presentation of presentations) {
      for (const [assetId, presentationReferences] of this
        .collectPresentationAssetReferences(presentation)
        .entries()) {
        const currentReferences = references.get(assetId) ?? [];
        currentReferences.push(...presentationReferences);
        references.set(assetId, currentReferences);
      }
    }

    return references;
  }

  private collectPresentationAssetReferences(
    presentation: Presentation
  ): Map<string, AssetReference[]> {
    const references = new Map<string, AssetReference[]>();
    const seenReferences = new Set<string>();
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
          presentationId: presentation.id,
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
            presentationId: presentation.id,
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
        meta.presentationId,
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

  private collectSelectedAssets(
    node: TreeNode<AssetTreeRow>,
    selectedAssets: Map<string, AssetDto>,
    parentSelected: boolean
  ): void {
    const nodeSelected = this.isTreeNodeSelected(node, parentSelected);

    if (node.data && this.isAssetRow(node.data) && nodeSelected) {
      selectedAssets.set(node.data.asset.id, node.data.asset);
    }

    for (const child of node.children ?? []) {
      this.collectSelectedAssets(child, selectedAssets, nodeSelected);
    }
  }

  private isTreeNodeSelected(
    node: TreeNode<AssetTreeRow>,
    parentSelected: boolean
  ): boolean {
    if (parentSelected) {
      return true;
    }

    if (!node.key) {
      return false;
    }

    return this.selectionKeys[node.key]?.checked === true;
  }

  private removeSelectionKeysForAssets(assetIds: Set<string>): void {
    const nextSelectionKeys: Record<string, TreeSelectionState> = {};

    for (const [key, value] of Object.entries(this.selectionKeys)) {
      const shouldRemove = Array.from(assetIds).some((assetId) =>
        key.endsWith(`-${assetId}`)
      );

      if (!shouldRemove) {
        nextSelectionKeys[key] = value;
      }
    }

    this.selectionKeys = nextSelectionKeys;
  }

  private getPresentationNodeKey(presentationId: string): string {
    return `presentation-${presentationId}`;
  }

  private getAssetNodeKey(presentationId: string, assetId: string): string {
    return `asset-${presentationId}-${assetId}`;
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
