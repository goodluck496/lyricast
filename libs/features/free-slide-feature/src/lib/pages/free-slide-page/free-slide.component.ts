import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { Store } from '@ngrx/store';
import { Slide, SlideDto, SerializedState } from '@lyri-cast/entities';
import { Actions } from '@ngrx/effects';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PageContainerComponent } from '@lyri-cast/ui-lib';
import {
  FreeSlidePages,
  PAGE_CONTAINER_TEMPLATES,
  Pages,
} from '@lyri-cast/common-browser';
import { FreeSlideService } from './free-slide.service';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import {
  combineLatest,
  debounceTime,
  first,
  fromEvent,
  Subject,
  take,
  takeUntil,
  merge,
  withLatestFrom,
  filter,
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
  selectFreeSlideSelected,
} from '@lyri-cast/free-slide-store';
import {
  AssetStorageService,
  PixiSlideEditorV2Component,
} from '@lyri-cast/form';
import { ActivatedRoute } from '@angular/router';
import { FreeSlideApiService } from '@lyri-cast/free-slide';
import { PrimeTemplate } from 'primeng/api';
import { Ripple } from 'primeng/ripple';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { CtrlDragCopyDirective } from '../../directives/ctrl-drag-copy.directive';
import { SelectModule } from 'primeng/select';
import { PopoverModule } from 'primeng/popover';
import { filterEmpty } from '@lyri-cast/common';

@Component({
  selector: 'lyri-free-slide',
  standalone: true,
  imports: [
    CommonModule,
    ButtonDirective,
    FormsModule,
    ReactiveFormsModule,
    PageContainerComponent,
    CardModule,
    InputTextModule,
    NgScrollbar,
    PreviewSlideComponent,
    FreeSlideSidebarComponent,
    PixiSlideEditorV2Component,
    PrimeTemplate,
    Ripple,
    DragDropModule,
    CtrlDragCopyDirective,
    PopoverModule,
    SelectModule
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

  containerPagePath: (string | Pages)[] = [];

  changePresentation$ = new Subject<void>();

  private initKeyboardControl() {
    fromEvent<KeyboardEvent>(window, 'keydown')
      .pipe(
        debounceTime(100),
        takeUntil(this.changePresentation$),
        takeUntilDestroyed(this.destroyRef),
        filter((event) => {
          const el = event.target as HTMLElement | null;
          const tag = (el?.tagName || '').toLowerCase();
          const isEditable =
            tag === 'input' ||
            tag === 'textarea' ||
            tag === 'select' ||
            el?.isContentEditable;
          return !isEditable;
        }),
        withLatestFrom(
          this.store.select(selectFreeSlideCastingStarted),
          this.store.select(selectFreeSlideCastingProcess),
          this.store.select(selectFreeSlideNavigateState)
        )
      )
      .subscribe(([event, castingStarted, process, navigate]) => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          const dir = event.key === 'ArrowDown' ? 'next' : 'prev';
          this.onNavigateByKeyboard(dir, {
            castingStarted,
            process,
            navigate,
          });
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          this.onStartCastingByKeyboard();
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          this.store.dispatch(FreeSlideActions[FreeSlideActionsEnum.pauseCasting]());
        }
      });
  }

  private onStartCastingByKeyboard() {
    this.slideService.saveCompleted$.pipe(take(1)).subscribe(() => {
      this.store
        .select(selectFreeSlideSelected)
        .pipe(filterEmpty(), take(1))
        .subscribe((slide) => {
          const currentSlides = this.slideService.slides$.value;
          this.store.dispatch(
            FreeSlideActions[FreeSlideActionsEnum.openCasting]({
              slideId: slide.id,
              slides: currentSlides,
              fromIndex: slide.index,
            })
          );
        });
    });

    this.slideService.requestSaveCurrentSlide$.next();
  }

  private onNavigateByKeyboard(
    dir: 'prev' | 'next',
    ctx: {
      castingStarted: boolean;
      process: { slides: Slide[]; fromIndex: number } | null;
      navigate: { index?: number } | null;
    }
  ) {
    if (ctx.castingStarted && ctx.process?.slides?.length) {
      const currentIndex =
        typeof ctx.navigate?.index === 'number'
          ? ctx.navigate.index
          : ctx.process.fromIndex;

      const nextIndex = dir === 'next' ? currentIndex + 1 : currentIndex - 1;
      const boundedIndex = Math.max(
        0,
        Math.min(nextIndex, ctx.process.slides.length - 1)
      );
      const nextSlide = ctx.process.slides[boundedIndex];
      if (!nextSlide) {
        return;
      }

      // While casting, keyboard navigation should also update the editor and preview.
      // onSelectSlide() already keeps store selection and casting navigation in sync.
      void this.onSelectSlide(nextSlide);
      return;
    }

    const nextIndex = dir === 'next' ? this.currentSlideIndex + 1 : this.currentSlideIndex - 1;
    const slide = this.slideService.getSlideByIndex(nextIndex);
    if (slide) {
      void this.onSelectSlide(slide);
    }
  }

  @ViewChild(PixiSlideEditorV2Component)
  pixiEditor!: PixiSlideEditorV2Component;
  @ViewChild(CtrlDragCopyDirective)
  ctrlCopyDir?: CtrlDragCopyDirective;

  slideForm = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
  });

  currentSlideId = '';
  loadedSlideId = '';
  currentSlideIndex = 1;

  slides$ = this.slideService.slides$.asObservable();

  presentationId = signal<string>('');

  $pagePath = computed(() => [
    Pages.MAIN,
    Pages.FREE_SLIDE_FEATURE,
    FreeSlidePages.SLIDE,
    this.presentationId(),
  ]);

  private saveTrigger$ = new Subject<void>();
  private previewTrigger$ = new Subject<void>();
  // Track last saved content hash per slide to avoid redundant preview uploads
  private lastContentHashBySlideId = new Map<string, string>();

  private loadVersion = 0;

  private async waitForEditorReady(timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    return await new Promise<boolean>((resolve) => {
      const check = () => {
        if (this.pixiEditor && this.pixiEditor.app) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(check, 30);
      };
      check();
    });
  }

  private async updateLivePreview() {
    try {
      if (!this.pixiEditor) return;
      // Более высокое разрешение превью для сайдбара
      const blob = await this.pixiEditor.generateSnapshot({ resolution: 0.6 });
      if (blob) {
        const url = URL.createObjectURL(blob);
        this.slideService.setLivePreviewObjectUrl(url);
      }
    } catch {
      return;
    }
  }

  async onAddNewSlide() {
    const newSlide = this.slideService.addSlide();
    await this.onSelectSlide(newSlide);
  }

  async onSelectSlide(slide: SlideDto | Slide) {
    // Автосохранение текущего слайда перед переключением
    if (
      this.loadedSlideId &&
      this.pixiEditor &&
      this.loadedSlideId !== slide.id
    ) {
      await this.onSaveSlide({ isNavigatingAway: true, slideId: this.loadedSlideId });
    } else if (this.currentSlideId === slide.id) {
      return;
    }


    this.slideForm.patchValue({ name: slide.name }, { emitEvent: false });
    this.slideForm.markAsPristine();

    this.currentSlideId = slide.id;
    this.currentSlideIndex = slide.index;

    // Обновляем UI/стор сразу, чтобы клик по слайду ощущался мгновенно
    this.store.dispatch(
      FreeSlideActions[FreeSlideActionsEnum.selectSlide](slide)
    );
    this.slideService.notifyUiUpdate();
    this.cdr.markForCheck();

    // Новая версия загрузки — всё, что было запущено до этого, считается устаревшим
    const version = ++this.loadVersion;

    // Дожидаемся инициализации PixiJS перед очисткой/десериализацией
    const ready = await this.waitForEditorReady();
    if (version !== this.loadVersion) return; // stale click/load

    if (this.pixiEditor && ready && this.pixiEditor.app) {
      this.pixiEditor.clearAllNodes();
      if (slide.content) {
        try {
          const slideData = JSON.parse(slide.content) as SerializedState;

          // Restore aspect ratio BEFORE deserializing nodes
          if (slideData.aspectRatio) {
            this.pixiEditor.onAspectRatioChange(slideData.aspectRatio);
          }

          // Preload assets so text/metrics are ready before layout
          await this.pixiEditor.serializer.preloadAssets(slideData);
          if (version !== this.loadVersion) return; // stale load, abort

          // Clear current nodes to avoid races when switching quickly
          this.pixiEditor.clearAllNodes();
          this.pixiEditor.serializer.deserializeState(slideData);
          this.pixiEditor.sceneViewport.updateSceneBounds();

          if (version !== this.loadVersion) return;
          this.loadedSlideId = slide.id;

          // После десериализации прогоняем layout для всех текстовых нод,
          // но делаем это асинхронно и с защитой от гонок.
          void (async () => {
            if (version !== this.loadVersion) return;
            await this.pixiEditor.fitAllTextNodes();
          })();
        } catch (e) {
          console.error('Error parsing slide data, clearing editor', e);
          this.pixiEditor.clearAllNodes();
        }
      } else {
        this.pixiEditor.clearAllNodes();
        if (version !== this.loadVersion) return;
        this.loadedSlideId = slide.id;
      }
    }

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

  async onSaveSlide(
    options: { isNavigatingAway?: boolean; slideId?: string } = {}
  ) {
    if (!this.pixiEditor) {
      console.warn('[FreeSlide] Cannot save: pixiEditor is not ready');
      return;
    }

    const targetSlideId = options.slideId || this.loadedSlideId || this.currentSlideId;
    if (!targetSlideId) return;

    // Никогда не сохраняем состояние редактора в слайд, который не загружен в Pixi.
    // Иначе при быстром переключении можно перезаписать контент другого слайда.
    if (this.loadedSlideId && targetSlideId !== this.loadedSlideId) {
      return;
    }

    const editorState = this.pixiEditor.serializer.serializeState();
    const htmlString = JSON.stringify(editorState);
    // Compute a simple content hash based on serialized editor state
    const contentHash = htmlString;

    // Reuse existing preview asset if content hasn't changed
    let assetId: string | undefined;
    const currentSlide = this.slideService.slidesMap.get(targetSlideId);

    const lastHash = this.lastContentHashBySlideId.get(targetSlideId);
    if (lastHash !== contentHash) {
      // Если за время генерации превью пользователь переключился на другой слайд — отменяем.
      if (this.loadedSlideId && this.loadedSlideId !== targetSlideId) return;
      const blob = await this.pixiEditor.generateSnapshot();
      if (this.loadedSlideId && this.loadedSlideId !== targetSlideId) return;
      if (blob) {
        // Upload new preview first; backend deduplicates by content hash
        const newAssetId = await this.assetStorage.saveAsset(blob, 'image/jpeg');
        if (this.loadedSlideId && this.loadedSlideId !== targetSlideId) return;
        const oldAssetId = currentSlide?.previewAssetId;

        // If old asset exists and differs from new one, delete it only if not reused elsewhere
        if (oldAssetId && oldAssetId !== newAssetId) {
          const isReused = Array.from(this.slideService.slidesMap.values()).some(
            (s) => s.id !== targetSlideId && s.previewAssetId === oldAssetId
          );
          if (!isReused) {
            await this.assetStorage.deleteAsset(oldAssetId);
          }
        }

        assetId = newAssetId;
      }
    } else {
      // No visual change; keep existing preview asset
      assetId = currentSlide?.previewAssetId;
    }


    // const { id } = RouteParamsReducerHelper.reduceSnapshot(this.route.snapshot);

    const slidePayload = {
      id: targetSlideId,
      name:
        targetSlideId === this.currentSlideId
          ? this.slideForm.getRawValue().name
          : (currentSlide?.name ?? this.slideForm.getRawValue().name),
      index:
        targetSlideId === this.currentSlideId
          ? this.currentSlideIndex
          : (currentSlide?.index ?? this.currentSlideIndex),
      content: htmlString,
      previewAssetId: assetId,
    };

    this.slideService.updateSlide(slidePayload, {
      suppressUiUpdate: !!options.isNavigatingAway,
    });

    this.slideForm.markAsPristine();

    // Update content hash after successful update attempt
    this.lastContentHashBySlideId.set(targetSlideId, contentHash);

    // Live-sync logic: if casting is active for this slide, dispatch an update.
    if (!options.isNavigatingAway) {
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
            castedSlideId = process.slides[process.fromIndex]?.id;
          }

          // If the slide we just saved is the one on the casting screen, dispatch the update
          if (castedSlideId === targetSlideId) {
            const liveSyncEnabled = this.slideService.liveSyncEnabled$.value;

            if (liveSyncEnabled) {
              this.store.dispatch(
                FreeSlideActions[FreeSlideActionsEnum.liveUpdateSlide]({
                  slide: slidePayload as Slide,
                })
              );
            }
          }
        });
    }

    // Notify that save is complete
    this.slideService.saveCompleted$.next();
  }

  async onDuplicateSlide() {
    // 1. Ensure the current state is saved so we copy the latest version.
    await this.onSaveSlide({ slideId: this.loadedSlideId || this.currentSlideId });

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
        this.loadedSlideId = '';
        this.currentSlideIndex = -1;
        // this.currentSlideName = '';
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
    if (this.pixiEditor && (this.loadedSlideId || this.currentSlideId)) {
      this.onSaveSlide({ slideId: this.loadedSlideId || this.currentSlideId });
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

    // Единый триггер для автосохранения
    this.saveTrigger$
      .pipe(
        debounceTime(800),
        takeUntil(this.changePresentation$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.onSaveSlide();
      });

    // Быстрый превью-апдейт (без записи в БД), чтобы sidebar обновлялся почти мгновенно
    this.previewTrigger$
      .pipe(
        debounceTime(80),
        takeUntil(this.changePresentation$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.updateLivePreview();
      });

    // При изменении названия слайда - запускаем триггер сохранения
    this.slideForm.valueChanges
      .pipe(
        takeUntil(this.changePresentation$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.previewTrigger$.next();
        this.saveTrigger$.next();
      });

    // При любом изменении в редакторе - запускаем триггер сохранения
    setTimeout(() => {
      if (this.pixiEditor) {
        merge(
          this.pixiEditor.history.commandExecuted$,
          this.pixiEditor.change$
        )
          .pipe(
            takeUntil(this.changePresentation$),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe(() => {
            this.previewTrigger$.next();
            this.saveTrigger$.next();
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

    this.initKeyboardControl();
  }

  ngAfterViewInit() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((paramsMap) => {
        const presentationId = paramsMap.get('id');
        if (presentationId) {
          // Fire and forget; updateSlideInService handles async save-before-switch
          this.updateSlideInService(presentationId);
        }
      });
  }

  async updateSlideInService(presentationId: string) {
    // Save current slide immediately to avoid losing debounced changes (e.g., title)
    if ((this.loadedSlideId || this.currentSlideId) && this.pixiEditor) {
      await this.onSaveSlide({
        isNavigatingAway: true,
        slideId: this.loadedSlideId || this.currentSlideId,
      });
    }
    this.changePresentation$.next();
    this.slideService.clear(); // Synchronously clear the state before async operations

    this.presentationId.set(presentationId);
    this.containerPagePath = [
      Pages.FREE_SLIDE,
      FreeSlidePages.SLIDE,
      presentationId,
    ];
    this.cdr.markForCheck();

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

  onSlidesDrop(event: CdkDragDrop<any>) {
    const isCopy = this.ctrlCopyDir?.isCtrlPressed() ?? (event.event as MouseEvent | PointerEvent | KeyboardEvent | undefined as any)?.ctrlKey === true;
    const prevIndex = event.previousIndex;
    const currIndex = event.currentIndex;
    if (prevIndex === currIndex && !isCopy) return;

    if (isCopy) {
      this.slideService.copySlide(prevIndex, currIndex);
    } else {
      this.slideService.reorderSlides(prevIndex, currIndex);
    }

    const selected = this.slideService.slidesMap.get(this.currentSlideId);
    if (selected) {
      this.currentSlideIndex = selected.index;
      this.cdr.markForCheck();
    }
  }

  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
  protected readonly Pages = Pages;
  protected readonly FreeSlidePages = FreeSlidePages;
  protected readonly window = window;
}
