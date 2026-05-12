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

  ngOnInit() {
    this.loadAssets();
  }

  loadAssets() {
    this.loading.set(true);
    this.assetsApiService.getAssets().subscribe({
      next: (assets) => {
        // Filter only images and exclude previews by kind
        this.assets.set(
          assets.filter(
            (a) =>
              a.mimeType.startsWith('image/') && a.kind !== 'preview'
          )
        );
        this.loading.set(false);
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
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Успешно',
          detail: `Загружено файлов: ${files.length}.`,
          life: 3000,
        });
        this.loadAssets();
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
}
