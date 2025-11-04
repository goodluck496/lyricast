import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { Store } from '@ngrx/store';
import { SlideDto } from '@lyri-cast/entities';
import { Actions } from '@ngrx/effects';
import { FormsModule } from '@angular/forms';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import { PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { DropdownModule } from 'primeng/dropdown';
import { FreeSlideService } from './free-slide.service';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import {
  combineLatest,
  debounceTime,
  first,
  Subject,
  take,
  takeUntil,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgScrollbar } from 'ngx-scrollbar';
import { PreviewSlideComponent } from '../../components/preview-slide/preview-slide.component';
import { FreeSlideSidebarComponent } from '../../components/free-slide-sidebar/free-slide-sidebar.component';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  selectFreeSlideCastingProcess,
  selectFreeSlideCastingStarted,
  selectFreeSlideNavigateState,
} from '@lyri-cast/free-slide-store';
import {
  AssetStorageService,
  PixiSlideEditorV2Component,
} from '@lyri-cast/form';
import { ActivatedRoute } from '@angular/router';
import { FreeSlideApiService } from '@lyri-cast/free-slide';

@Component({
  selector: 'lyri-free-slide',
  standalone: true,
  imports: [
    CommonModule,
    ButtonDirective,
    FormsModule,
    PageContainerComponent,
    DropdownModule,
    CardModule,
    InputTextModule,
    NgScrollbar,
    PreviewSlideComponent,
    FreeSlideSidebarComponent,
    PixiSlideEditorV2Component,
  ],
  templateUrl: './free-slide.component.html',
  styleUrl: './free-slide.component.scss',
  providers: [FreeSlideService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideComponent implements AfterViewInit {
  cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(FreeSlideApiService);
  store = inject(Store);
  actions$ = inject(Actions);
  slideService = inject(FreeSlideService);
  destroyRef = inject(DestroyRef);
  assetStorage = inject(AssetStorageService);

  changePresentation$ = new Subject<void>();

  @ViewChild(PixiSlideEditorV2Component)
  pixiEditor!: PixiSlideEditorV2Component;

  currentSlideId = '';
  currentSlideIndex = 1;
  currentSlideName = '';

  slides$ = this.slideService.slides$.asObservable();

  // Автосохранение с debounce при изменениях в редакторе
  private autoSave$ = new Subject<void>();

  async onAddNewSlide() {
    const newSlide = this.slideService.addSlide();
    await this.onSelectSlide(newSlide);
  }

  async onSelectSlide(slide: SlideDto) {
    // Автосохранение текущего слайда перед переключением
    if (
      this.currentSlideId &&
      this.pixiEditor &&
      this.currentSlideId !== slide.id
    ) {
      await this.onSaveSlide();
    }
    console.log('on select slide', slide);

    this.currentSlideName = slide.name;
    this.currentSlideId = slide.id;
    this.currentSlideIndex = slide.index;

    if (this.pixiEditor && this.pixiEditor.app) {
      this.pixiEditor.clearAllNodes();
      if (slide.content) {
        try {
          const slideData = JSON.parse(slide.content);
          // Trigger preloading in the background, but don't await it to avoid blocking UI
          void this.pixiEditor.serializer.preloadAssets(slideData);
          this.pixiEditor.serializer.deserializeState(slideData);
        } catch (e) {
          console.error('Error parsing slide data, clearing editor', e);
          this.pixiEditor.clearAllNodes();
        }
      } else {
        this.pixiEditor.clearAllNodes();
      }
    }

    this.store.dispatch(
      FreeSlideActions[FreeSlideActionsEnum.selectSlide](slide)
    );

    this.store
      .select(selectFreeSlideCastingStarted)
      .pipe(take(1))
      .subscribe((started) => {
        if (!started) {
          return;
        }
        this.store.dispatch(
          FreeSlideActions[FreeSlideActionsEnum.slideNavigate]({
            slide: slide,
            index: slide.index,
          })
        );
      });
  }

  async onSaveSlide() {
    if (!this.pixiEditor) {
      console.warn('[FreeSlide] Cannot save: pixiEditor is not ready');
      return;
    }
    const editorState = this.pixiEditor.serializer.serializeState();
    const htmlString = JSON.stringify(editorState);
    const blob = await this.pixiEditor.generateSnapshot();

    let assetId: string | undefined;
    const currentSlide = this.slideService.slidesMap.get(this.currentSlideId);

    if (blob) {
      if (currentSlide?.previewAssetId) {
        await this.assetStorage.deleteAsset(currentSlide.previewAssetId);
      }
      assetId = await this.assetStorage.saveAsset(blob, 'image/jpeg');
    }

    console.log('[FreeSlide] Saving slide:', this.currentSlideName);

    // const { id } = RouteParamsReducerHelper.reduceSnapshot(this.route.snapshot);

    this.slideService.updateSlide({
      id: this.currentSlideId,
      name: this.currentSlideName,
      index: this.currentSlideIndex,
      content: htmlString,
      previewAssetId: assetId,
    });

    // Live-sync logic: if casting is active for this slide, dispatch an update.
    combineLatest([
      this.store.select(selectFreeSlideNavigateState),
      this.store.select(selectFreeSlideCastingProcess),
    ])
      .pipe(take(1))
      .subscribe(([navigate, process]) => {
        if (!process) return; // Not casting

        // Determine the ID of the slide currently on the casting screen
        let castedSlideId: string | undefined;
        if (navigate?.slide) {
          castedSlideId = navigate.slide.id;
        } else {
          // If no navigation has happened, the casted slide is the initial one
          castedSlideId = process.slides[process.fromIndex]?.index.toString();
        }

        // If the slide we just saved is the one on the casting screen, dispatch the update
        if (castedSlideId === this.currentSlideId) {
          const updatedSlide = this.slideService.slidesMap.get(
            this.currentSlideId
          );
          const liveSyncEnabled = this.slideService.liveSyncEnabled$.value;

          if (updatedSlide && liveSyncEnabled) {
            this.store.dispatch(
              FreeSlideActions[FreeSlideActionsEnum.liveUpdateSlide]({
                slide: updatedSlide,
              })
            );
          }
        }
      });

    // Notify that save is complete
    this.slideService.saveCompleted$.next();
  }

  async onDuplicateSlide() {
    // 1. Ensure the current state is saved so we copy the latest version.
    await this.onSaveSlide();

    const originalSlide = this.slideService.slidesMap.get(this.currentSlideId);
    if (!originalSlide) return;

    // --- New Naming Logic ---
    const baseName = originalSlide.name.replace(
      /\s*\(\s*copy(\s\d+)?\s*\)$/,
      ''
    );
    let newName = `${baseName} (copy)`;
    let copyNum = 2;
    const allNames = new Set(
      Array.from(this.slideService.slidesMap.values()).map((s) => s.name)
    );
    while (allNames.has(newName)) {
      newName = `${baseName} (copy ${copyNum})`;
      copyNum++;
    }
    // --- End New Naming Logic ---

    const duplicatedData: Partial<SlideDto> = {
      ...originalSlide,
      name: newName,
    };

    const newSlide = this.slideService.addSlide(duplicatedData);
    await this.onSelectSlide(newSlide);
  }

  async onDeleteSelected() {
    if (this.currentSlideIndex === 0) {
      console.warn('[FreeSlide] Cannot delete the first slide.');
      return;
    }

    const slideToDelete = this.slideService.slidesMap.get(this.currentSlideId);
    if (slideToDelete?.previewAssetId) {
      // Check if any other slide uses this asset
      const allSlides = Array.from(this.slideService.slidesMap.values());
      const isAssetReused = allSlides.some(
        (s) =>
          s.id !== slideToDelete.id &&
          s.previewAssetId === slideToDelete.previewAssetId
      );

      if (!isAssetReused) {
        // Only delete if it's not reused
        await this.assetStorage.deleteAsset(slideToDelete.previewAssetId);
      }
    }

    const nextSlide = this.slideService.getSlideByIndex(
      this.currentSlideIndex + 1
    );
    const prevSlide = this.slideService.getSlideByIndex(
      this.currentSlideIndex - 1
    );

    this.slideService.removeSlide(this.currentSlideId);

    if (nextSlide) {
      await this.onSelectSlide(nextSlide);
    } else if (prevSlide) {
      await this.onSelectSlide(prevSlide);
    } else {
      const list = Array.from(this.slideService.slidesMap.values());
      if (list.length > 0) {
        await this.onSelectSlide(list[list.length - 1]);
      } else {
        // Handle case where no slides are left
        this.currentSlideId = '';
        this.currentSlideIndex = -1;
        this.currentSlideName = '';
        this.pixiEditor.clearAllNodes();
        this.cdr.markForCheck();
      }
    }
  }

  onResetSlide() {
    if (this.pixiEditor) {
      this.pixiEditor.clearAllNodes();
      this.onSaveSlide();
    }
  }

  /**
   * Сохраняет текущий слайд перед трансляцией.
   * Этот метод вызывается из сайдбара перед началом кастинга.
   */
  saveCurrentSlide() {
    if (this.pixiEditor && this.currentSlideId) {
      this.onSaveSlide();
    }
  }

  initSubscriptions() {
    // Сброс состояния кастинга при инициализации free-slide фичи
    this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.stopCasting]());

    // Подписка на запросы сохранения текущего слайда (например, перед трансляцией)
    this.slideService.requestSaveCurrentSlide$
      .pipe(
        takeUntil(this.changePresentation$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.onSaveSlide();
      });

    // Автосохранение с задержкой 3 секунды после изменений
    this.autoSave$
      .pipe(
        debounceTime(2000),
        takeUntil(this.changePresentation$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.onSaveSlide();
      });

    // Подписка на изменения в редакторе (команды)
    // Запускаем автосохранение при любых изменениях
    setTimeout(() => {
      if (this.pixiEditor?.history) {
        this.pixiEditor.history.commandExecuted$
          .pipe(
            takeUntil(this.changePresentation$),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe(() => {
            this.autoSave$.next();
          });
      }
    }, 200);

    // Даём время на инициализацию PixiJS редактора перед загрузкой первого слайда
    this.slides$
      .pipe(first(), takeUntil(this.changePresentation$))
      .subscribe((slides) => {
        const firstSlide = slides[0];
        if (firstSlide) {
          // Небольшая задержка для завершения инициализации PixiJS
          setTimeout(async () => {
            await this.onSelectSlide(firstSlide);
          }, 150);
        }
      });
  }

  ngAfterViewInit() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((paramsMap) => {
        const presentationId = paramsMap.get('id');
        if (presentationId) {
          this.updateSlideInService(presentationId);
        }
      });
  }

  updateSlideInService(presentationId: string) {
    this.changePresentation$.next();

    this.api
      .getById(presentationId)
      .pipe(first(), takeUntilDestroyed(this.destroyRef))
      .subscribe((presentation) => {
        this.slideService.setPresentation(presentation);
        this.initSubscriptions();

        const firstSlide = presentation.slides[0];
        if (firstSlide) {
          this.onSelectSlide(firstSlide);
        }

        this.cdr.detectChanges();
      });
  }

  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
  protected readonly Pages = Pages;
}
