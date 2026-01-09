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
import { AssetsApiService } from '@lyri-cast/shared-browser/data-access/assets';
import { AssetDto } from '@lyri-cast/entities';
import { forkJoin, switchMap } from 'rxjs';

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
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './asset-management.component.html',
  styleUrl: './asset-management.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetManagementComponent implements OnInit {
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  assets = signal<AssetDto[]>([]);
  selectedAssets: AssetDto[] = [];
  loading = signal(false);

  ngOnInit() {
    this.loadAssets();
  }

  loadAssets() {
    this.loading.set(true);
    this.selectedAssets = [];
    this.assetsApiService.getAssets().subscribe((assets) => {
      this.assets.set(assets);
      this.loading.set(false);
    });
  }

  getAssetUrl(asset: AssetDto): string {
    return this.assetsApiService.getAssetUrl(asset.id);
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
          return this.assetsApiService.getAssets();
        })
      )
      .subscribe((assets) => {
        this.assets.set(assets);
        this.selectedAssets = [];
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
}
