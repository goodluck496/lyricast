import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import {
  FreeSlidePages,
  PAGE_CONTAINER_TEMPLATES,
  Pages,
} from '@lyri-cast/common-browser';
import { PrimeTemplate } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { FreeSlideApiService } from '@lyri-cast/shared-browser/data-access/free-slide';
import { BehaviorSubject, first } from 'rxjs';
import { Presentation, SerializedState } from '@lyri-cast/entities';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Ripple } from 'primeng/ripple';
import { AssetStorageService } from '@lyri-cast/form';
import { AssetsApiService } from '@lyri-cast/shared-browser/data-access/assets';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { CreateFromSongDialogComponent } from '../../components/create-from-song-dialog/create-from-song-dialog.component';
import { PresentationDto, SlideDto } from '@lyri-cast/entities';

export type PresentationWithPreview = Presentation & {
  inEdit: boolean;
  previewUrl?: string;
};

import { SplitButtonModule } from 'primeng/splitbutton';
import { PptxFacadeService } from '../../services/pptx-facade.service';
import { TextSlidePreviewHelper } from '../../utils/text-slide-preview.helper';

@Component({
  selector: 'lyri-free-slide-main',
  standalone: true,
  imports: [
    CommonModule,
    PageContainerComponent,
    PrimeTemplate,
    CardModule,
    ButtonModule,
    Ripple,
    FormsModule,
    InputTextModule,
    NgScrollbarModule,
    CreateFromSongDialogComponent,
    SplitButtonModule,
  ],
  templateUrl: './free-slide-main.component.html',
  styleUrl: './free-slide-main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideMainComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  protected readonly Pages = Pages;
  protected readonly FreeSlidePages = FreeSlidePages;
  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;

  private readonly api = inject(FreeSlideApiService);
  private readonly assetStorage = inject(AssetStorageService);
  private readonly assetsApi = inject(AssetsApiService);
  private readonly pptxFacade = inject(PptxFacadeService);

  presentations$ = new BehaviorSubject<PresentationWithPreview[]>([]);

  showCreateFromSong = signal(false);

  newPresentationOptions = [
    {
      label: 'Создать из песни',
      icon: 'pi pi-music',
      command: () => this.onOpenCreateFromSong()
    },
    {
      label: 'Импорт PPTX',
      icon: 'pi pi-file-import',
      command: () => {
        // Find the hidden input and click it
        const input = document.getElementById('pptx-import-input') as HTMLInputElement;
        if (input) input.click();
      }
    }
  ];

  onImportPptxFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const filename = file.name.replace(/\.pptx$/, '');
      
      this.pptxFacade.importPptx(file).subscribe({
        next: async (states) => {
          const preparedStates = await Promise.all(
            states.map((state) => this.persistImportedImageAssets(state))
          );
          const newSlides: SlideDto[] = await Promise.all(preparedStates.map(async (state, index) => ({
            name: `Слайд ${index + 1}`,
            content: JSON.stringify(state),
            index,
            id: '',
            createdAt: 0,
            previewAssetId: await this.generatePptxImportPreview(state) ?? '',
            groupId: 0
          })));

          this.api.create({
            title: filename,
            slides: newSlides
          }).subscribe((data) => {
            this.router.navigate(['..', FreeSlidePages.SLIDE, data.id], {
              relativeTo: this.route,
            });
          });
        },
        error: (err) => {
          console.error('Failed to import PPTX', err);
        }
      });
      // Reset input
      input.value = '';
    }
  }

  private async generatePptxImportPreview(state: SerializedState): Promise<string | undefined> {
    const previewOptions = {
      width: state.sceneBounds?.width,
      height: state.sceneBounds?.height,
    };
    const canvas = state.nodes.some((node) => node.type === 'image')
      ? await TextSlidePreviewHelper.createCanvasWithAssets(
          state,
          (assetId) => this.assetStorage.getAssetBlob(assetId),
          previewOptions
        )
      : TextSlidePreviewHelper.createCanvas(state, previewOptions);
    if (!canvas) {
      return undefined;
    }

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });
    return blob ? this.savePptxPreviewAsset(blob) : undefined;
  }

  private async savePptxPreviewAsset(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    const chunks: string[] = [];

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      let binary = '';

      for (const byte of chunk) {
        binary += String.fromCharCode(byte);
      }

      chunks.push(binary);
    }

    const asset = await new Promise<{ id: string }>((resolve, reject) => {
      this.assetsApi.uploadAssetBase64({
        originalName: `pptx-preview-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        dataBase64: btoa(chunks.join('')),
      }).subscribe({ next: resolve, error: reject });
    });

    return asset.id;
  }

  private async persistImportedImageAssets(state: SerializedState): Promise<SerializedState> {
    const nodes = await Promise.all(
      state.nodes.map(async (node) => {
        if (node.type !== 'image' || !node.url?.startsWith('data:image/')) {
          return node;
        }

        const assetId = await this.assetStorage.importAssetFromUrl(node.url);
        return {
          ...node,
          assetId,
          url: undefined,
        };
      })
    );

    return {
      ...state,
      nodes,
    };
  }

  ngOnInit() {
    this.loadPresentations();

    this.cdr.detectChanges();

    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.loadPresentations();
        }
      });
  }

  loadPresentations() {
    this.api
      .getAll()
      .pipe(first())
      .subscribe(async (data) => {
        const presentationsWithPreviews = await Promise.all(
          data.map(async (p) => {
            const firstSlide = p.slides?.[0];
            if (firstSlide?.previewAssetId) {
              const url = await this.assetStorage.getAssetObjectURL(
                firstSlide.previewAssetId
              );
              return { ...p, previewUrl: url, inEdit: false };
            }
            return { ...p, inEdit: false };
          })
        );
        this.presentations$.next(presentationsWithPreviews);
      });
  }

  onCreateNew() {
    this.api
      .create({
        title: 'Новая презентация',
        slides: [],
      })
      .subscribe((data) => {
        this.router.navigate(['..', FreeSlidePages.SLIDE, data.id], {
          relativeTo: this.route,
        });
      });
  }

  onOpenCreateFromSong() {
    this.showCreateFromSong.set(true);
    this.cdr.markForCheck();
  }

  onCancelCreateFromSong() {
    this.showCreateFromSong.set(false);
    this.cdr.markForCheck();
  }

  onConfirmCreateFromSong(dto: PresentationDto) {
    this.api.create({ title: dto.title, slides: [] }).subscribe((data) => {
      // ensure previewAssetId and indices are saved
      this.api.update(data.id, { slides: dto.slides }).subscribe(() => {
        this.showCreateFromSong.set(false);
        this.router.navigate(['..', FreeSlidePages.SLIDE, data.id], {
          relativeTo: this.route,
        });
      });
    });
  }

  onSelect(presentation: Presentation) {
    this.router.navigate(['..', FreeSlidePages.SLIDE, presentation.id], {
      relativeTo: this.route,
    });
  }

  onDelete(event: MouseEvent, presentation: Presentation) {
    event.stopPropagation();
    this.api.delete(presentation.id).subscribe(() => {
      this.loadPresentations();
    });
  }

  onEdit(event: MouseEvent, presentation: PresentationWithPreview): void {
    event.stopPropagation();
    presentation.inEdit = true;
    this.cdr.markForCheck();
  }

  onEditComplete(
    event: MouseEvent | Event,
    presentation: PresentationWithPreview
  ): void {
    event.stopPropagation();
    presentation.inEdit = false;
    this.cdr.markForCheck();

    this.api.update(presentation.id, {
      title: presentation.title,
    }).subscribe();
  }

  protected readonly event = event;
}
