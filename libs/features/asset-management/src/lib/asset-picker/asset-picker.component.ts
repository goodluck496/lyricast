import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { FileUploadHandlerEvent, FileUploadModule } from 'primeng/fileupload';
import { AssetsApiService } from '@lyri-cast/shared-browser/data-access/assets';
import { AssetDto } from '@lyri-cast/entities';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'lyri-asset-picker',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TabsModule,
    FileUploadModule,
  ],
  providers: [MessageService],
  templateUrl: './asset-picker.component.html',
  styleUrl: './asset-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetPickerComponent implements OnInit {
  @Input() gridCols = 3;
  @Output() assetSelected = new EventEmitter<{ asset: AssetDto; url: string }>();

  private readonly assetsApiService = inject(AssetsApiService);
  private readonly messageService = inject(MessageService);

  assets = signal<AssetDto[]>([]);
  loading = signal(false);
  activeTab = signal('0');
  selectedAssetId = signal<string | null>(null);

  ngOnInit() {
    this.loadAssets();
  }

  loadAssets(assetToSelect: AssetDto | null = null) {
    this.loading.set(true);
    this.assetsApiService.getAssets().subscribe({
      next: (assets) => {
        const imageAssets = this.toImageAssets(assets);
        this.assets.set(imageAssets);
        this.loading.set(false);
        if (assetToSelect) {
          const selectedAsset =
            imageAssets.find((asset) => asset.id === assetToSelect.id) ??
            assetToSelect;
          this.onSelect(selectedAsset);
        }
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка загрузки',
          detail: 'Не удалось загрузить ассеты.',
          life: 5000,
        });
      },
    });
  }

  onImageError(asset: AssetDto) {
    // Если картинка не загрузилась (например 404, если файл физически удален), 
    // убираем ее из списка
    this.assets.update((list) => list.filter((a) => a.id !== asset.id));
  }

  getAssetUrl(asset: AssetDto): string {
    return this.assetsApiService.getAssetUrl(asset.id);
  }

  onSelect(asset: AssetDto) {
    this.selectedAssetId.set(asset.id);
    const url = this.getAssetUrl(asset);
    this.assetSelected.emit({ asset, url });
  }

  onUpload(event: FileUploadHandlerEvent) {
    const files = event.files;
    if (!files || files.length === 0) {
      return;
    }

    this.loading.set(true);
    const uploadObservables = files.map((file) =>
      this.assetsApiService.uploadAsset(file, 'content')
    );

    forkJoin(uploadObservables).subscribe({
      next: (uploadedAssets) => {
        const uploadedImageAssets = this.toImageAssets(uploadedAssets);
        const assetToSelect =
          uploadedImageAssets[uploadedImageAssets.length - 1] ?? null;
        this.messageService.add({
          severity: 'success',
          summary: 'Успешно',
          detail: `Загружено файлов: ${files.length}.`,
          life: 3000,
        });
        this.activeTab.set('0');
        this.loadAssets(assetToSelect);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось загрузить файлы.',
          life: 5000,
        });
      }
    });
  }

  onTabChange(value: unknown): void {
    if (typeof value === 'string' || typeof value === 'number') {
      this.activeTab.set(String(value));
    }
  }

  private toImageAssets(assets: AssetDto[]): AssetDto[] {
    return assets.filter(
      (asset) => asset.mimeType.startsWith('image/') && asset.kind !== 'preview'
    );
  }
}
