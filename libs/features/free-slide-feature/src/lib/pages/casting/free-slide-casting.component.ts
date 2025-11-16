import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  Renderer2,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import {
  selectFreeSlideCastingPaused,
  selectFreeSlideCastingProcess,
  selectFreeSlideCastingStarted,
  selectFreeSlideNavigateState,
  selectSlideTransitions,
  selectGlobalTransition,
} from '@lyri-cast/free-slide-store';
import { AppActions, BridgeService, Pages } from '@lyri-cast/common-browser';

import { filterEmpty } from '@lyri-cast/common';
import { combineLatest, filter, map, take } from 'rxjs';
import {
  SerializedIframeNode,
  SerializedState,
  Slide,
  DEFAULT_TRANSITION,
  SlideTransition,
} from '@lyri-cast/entities';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Actions, ofType } from '@ngrx/effects';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import { Application, Container } from 'pixi.js';
import {
  AssetStorageService,
  DEFAULT_CONFIG,
  EDITOR_CONFIG,
  EditorUtilsService,
  NodeFactoryService,
  TextFitService,
} from '@lyri-cast/form';
import { SlideTransitionService } from '../../services/slide-transition.service';

@Component({
  selector: 'lyri-free-slide-casting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './free-slide-casting.component.html',
  styleUrls: ['./free-slide-casting.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    NodeFactoryService,
    TextFitService,
    EditorUtilsService,
    SlideTransitionService,
    { provide: EDITOR_CONFIG, useValue: DEFAULT_CONFIG },
  ],
})
export class FreeSlideCastingComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly bridge = inject(BridgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly renderer = inject(Renderer2);
  private readonly assetStorage = inject(AssetStorageService);
  private readonly nodeFactory = inject(NodeFactoryService);
  private readonly transitionService = inject(SlideTransitionService);

  @ViewChild('pixiHost', { static: true })
  pixiHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('domOverlay', { static: true })
  domOverlayRef!: ElementRef<HTMLDivElement>;

  private app!: Application;
  private scene!: Container;
  private previousScene: Container | null = null; // предыдущая сцена для переходов
  private currentSlideId: string = ''; // ID текущего слайда
  private isTransitioning = false; // флаг выполняющегося перехода
  private previousSlideAssetIds: Set<string> = new Set();
  private renderVersion = 0; // инкрементируем для каждого нового рендера, чтобы отменять предыдущие

  hideContent = signal(false);

  private isUUID(str: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      str
    );
  }

  ngOnInit() {
    this.store
      .select(selectFreeSlideCastingStarted)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isCasting) => {
        this.hideContent.set(!isCasting);
      });

    // Unified stream to determine which slide to render
    combineLatest([
      this.store.select(selectFreeSlideCastingProcess),
      this.store.select(selectFreeSlideNavigateState),
      this.store.select(selectGlobalTransition),
      this.store.select(selectSlideTransitions),
    ])
      .pipe(
        filter(([process]) => !!process),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(([process, navigate, globalTransition, slideTransitions]) => {
        console.log('[Casting] Stream update', {
          hasProcess: !!process,
          hasNavigate: !!navigate,
          navigateSlideId: navigate?.slide?.id,
          globalTransition: globalTransition,
          slideTransitionsSize: slideTransitions.size
        });

        let slideToRender: Slide | undefined;

        if (navigate?.slide && process) {
          // If a navigation or live update has occurred, find the latest version of that slide
          const foundSlide = process.slides.find(
            (s) => s.id === navigate.slide.id
          );

          // The slide from the navigate state could be more up-to-date after a live update.
          // If the content differs, prioritize the slide from the navigate state.
          if (foundSlide && navigate.slide.content !== foundSlide.content) {
            slideToRender = navigate.slide;
          } else {
            slideToRender = foundSlide;
          }
        } else if (process) {
          // Otherwise, use the initial slide from the process
          slideToRender = process.slides[process.fromIndex];
        }

        if (slideToRender) {
          // Используем индивидуальный переход слайда, если он есть, иначе глобальный
          const transition = slideTransitions.get(slideToRender.id) || globalTransition;
          console.log('[Casting] Rendering slide with transition', {
            slideId: slideToRender.id,
            transitionType: transition.type,
            hasIndividualTransition: slideTransitions.has(slideToRender.id)
          });
          this.renderSlideWithTransition(slideToRender, transition);
        }
      });

    this.store
      .select(selectFreeSlideCastingPaused)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((paused) => {
        this.hideContent.set(paused);
      });

    this.actions$
      .pipe(
        ofType(AppActions.openPage),
        filter(() => this.bridge.windowType !== AppWindowTypes.MAIN),
        map((data) => ({ type: APP_COMMON_ACTIONS.openPage, payload: data })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.resizeHandler();
      });
  }

  async ngAfterViewInit() {
    await this.initPixiApp();
    this.nodeFactory.app = this.app;
    this.bridge.windowSrv.electronContext.send({
      event: 'OPENED_PAGE',
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  ngOnDestroy(): void {
    if (this.previousScene) {
      this.previousScene.destroy({ children: true });
    }
    this.app?.destroy(true);
  }

  @HostListener('window:resize', ['$event'])
  resizeHandler() {
    if (this.app) {
      const newWidth =
        this.pixiHostRef.nativeElement.clientWidth || window.innerWidth;
      const newHeight =
        this.pixiHostRef.nativeElement.clientHeight || window.innerHeight;

      this.app.renderer.resize(newWidth, newHeight);

      this.store
        .select(selectFreeSlideCastingProcess)
        .pipe(filterEmpty(), take(1))
        .subscribe((process) => {
          this.store
            .select(selectFreeSlideNavigateState)
            .pipe(take(1))
            .subscribe((navigate) => {
              const slideIndex = navigate?.index ?? process.fromIndex;
              const slide = process.slides[slideIndex];
              if (slide) {
                this.renderSlide(slide);
              }
            });
        });
    }
  }

  private async initPixiApp() {
    this.app = new Application();

    const containerWidth =
      this.pixiHostRef.nativeElement.clientWidth || window.innerWidth;
    const containerHeight =
      this.pixiHostRef.nativeElement.clientHeight || window.innerHeight;

    await this.app.init({
      width: containerWidth,
      height: containerHeight,
      backgroundAlpha: 0,
      antialias: true,
      resolution: 1,
    });

    this.pixiHostRef.nativeElement.appendChild(this.app.canvas);
    this.scene = new Container();
    this.app.stage.addChild(this.scene);
  }

  private async renderSlideWithTransition(slide: Slide, transition: SlideTransition) {
    console.log('[Casting] renderSlideWithTransition called', {
      slideId: slide.id,
      currentSlideId: this.currentSlideId,
      isTransitioning: this.isTransitioning,
      transition: transition
    });

    // Если уже выполняется переход, пропускаем
    if (this.isTransitioning) {
      console.log('[Casting] Transition already in progress, skipping');
      return;
    }

    // Если это тот же слайд, не делаем переход (но только если уже был рендер)
    if (this.currentSlideId === slide.id && this.previousScene) {
      console.log('[Casting] Same slide, skipping transition');
      return;
    }

    this.isTransitioning = true;

    try {
      console.log('[Casting] Creating new scene for slide', slide.id);
      // Создаем новую сцену для нового слайда
      const newScene = await this.createSlideScene(slide);
      
      if (!newScene) {
        console.log('[Casting] Failed to create scene');
        this.isTransitioning = false;
        return;
      }

      console.log('[Casting] Scene created, previousScene exists:', !!this.previousScene);

      // Если есть предыдущая сцена, выполняем переход
      if (this.previousScene && this.currentSlideId) {
        console.log('[Casting] Executing transition', transition.type);
        await this.transitionService.executeTransition({
          app: this.app,
          oldScene: this.previousScene,
          newScene: newScene,
          transition: transition,
        });
        
        console.log('[Casting] Transition completed, destroying old scene');
        // Уничтожаем предыдущую сцену
        this.previousScene.destroy({ children: true });
      } else {
        // Первый слайд - просто показываем без перехода
        console.log('[Casting] First slide, showing without transition');
        this.app.stage.removeChildren();
        this.app.stage.addChild(newScene);
      }

      // Обновляем текущие значения
      this.previousScene = newScene;
      this.currentSlideId = slide.id;
      this.scene = newScene;

      console.log('[Casting] Slide transition completed successfully');

    } catch (error) {
      console.error('[Casting] Error during slide transition:', error);
      // В случае ошибки, просто показываем новый слайд
      this.app.stage.removeChildren();
      if (this.previousScene) {
        this.app.stage.addChild(this.previousScene);
      }
    } finally {
      this.isTransitioning = false;
    }
  }

  private async createSlideScene(slide: Slide): Promise<Container | null> {
    if (!slide.content) {
      return null;
    }

    const scene = new Container();
    const currentVersion = ++this.renderVersion;
    const isStale = () => currentVersion !== this.renderVersion;

    try {
      const data: SerializedState = JSON.parse(slide.content);
      if (!data || !data.nodes) {
        return null;
      }
      if (isStale()) return null;

      const currentSlideAssetIds = new Set<string>();
      for (const node of data.nodes) {
        if ('assetId' in node && node.assetId) {
          currentSlideAssetIds.add(node.assetId);
        }
        if (
          'bgAssetId' in node &&
          node.bgAssetId &&
          this.isUUID(node.bgAssetId)
        ) {
          currentSlideAssetIds.add(node.bgAssetId);
        }
      }

      // Очищаем старые ассеты
      if (this.previousSlideAssetIds.size > 0) {
        for (const assetId of this.previousSlideAssetIds) {
          this.assetStorage.revokeAssetObjectURL(assetId);
        }
        this.previousSlideAssetIds.clear();
      }
      this.previousSlideAssetIds = currentSlideAssetIds;

      if (isStale()) return null;

      const canvasWidth = this.app.renderer.width;
      const canvasHeight = this.app.renderer.height;
      const sceneWidth = data.sceneBounds?.width || 1920;
      const sceneHeight = data.sceneBounds?.height || 1080;
      const scaleX = canvasWidth / sceneWidth;
      const scaleY = canvasHeight / sceneHeight;
      let scaleFactor = Math.min(scaleX, scaleY);
      if (!isFinite(scaleFactor) || scaleFactor <= 0) {
        scaleFactor = 1;
      }

      const iframeNodes: SerializedIframeNode[] = [];

      for (const nodeData of data.nodes) {
        if (nodeData.type === 'iframe') {
          iframeNodes.push(nodeData as SerializedIframeNode);
          continue;
        }

        const node = await this.nodeFactory.createNodeFromSerialized(nodeData, {
          isCastingMode: true,
          scaleFactor: scaleFactor,
        });
        if (isStale()) return null;
        
        if (node) {
          node.x = nodeData.x * scaleFactor;
          node.y = nodeData.y * scaleFactor;
          node.rotation = nodeData.rotation;
          node.alpha = nodeData.alpha ?? 1;
          scene.addChild(node);
        }
      }

      const scaledSceneWidth = sceneWidth * scaleFactor;
      const scaledSceneHeight = sceneHeight * scaleFactor;
      scene.x = (canvasWidth - scaledSceneWidth) / 2;
      scene.y = (canvasHeight - scaledSceneHeight) / 2;

      // Обрабатываем iframe элементы
      this.domOverlayRef.nativeElement.innerHTML = '';
      if (isStale()) return null;
      
      for (const iframeData of iframeNodes) {
        const iframe = this.renderer.createElement('iframe');
        this.renderer.setAttribute(iframe, 'src', iframeData.url);
        this.renderer.setStyle(iframe, 'position', 'absolute');
        const absoluteLeft = scene.x + iframeData.x * scaleFactor;
        const absoluteTop = scene.y + iframeData.y * scaleFactor;
        this.renderer.setStyle(iframe, 'left', `${absoluteLeft}px`);
        this.renderer.setStyle(iframe, 'top', `${absoluteTop}px`);
        this.renderer.setStyle(
          iframe,
          'width',
          `${iframeData.width * scaleFactor}px`
        );
        this.renderer.setStyle(
          iframe,
          'height',
          `${iframeData.height * scaleFactor}px`
        );
        this.renderer.setStyle(iframe, 'border', 'none');
        this.renderer.appendChild(this.domOverlayRef.nativeElement, iframe);
      }

      return scene;
    } catch (e) {
      console.error('[Casting] Failed to create slide scene:', e);
      return null;
    }
  }

  private async renderSlide(slide: Slide) {
    // Версионный токен для отмены конкурирующих рендеров (live-sync может прислать несколько событий подряд)
    const currentVersion = ++this.renderVersion;
    const isStale = () => currentVersion !== this.renderVersion;

    // Aggressively clear the stage to prevent artifacts
    this.app.stage.removeChildren();
    this.app.stage.addChild(this.scene);
    this.scene.removeChildren();

    // Clear the scene and DOM overlay before rendering new content
    this.domOverlayRef.nativeElement.innerHTML = '';
    if (isStale()) return; // если уже начался новый рендер, выходим

    if (this.previousSlideAssetIds.size > 0) {
      for (const assetId of this.previousSlideAssetIds) {
        this.assetStorage.revokeAssetObjectURL(assetId);
      }
      this.previousSlideAssetIds.clear();
    }

    if (!slide.content) {
      return;
    }

    try {
      const data: SerializedState = JSON.parse(slide.content);
      if (!data || !data.nodes) {
        return;
      }
      if (isStale()) return;

      const currentSlideAssetIds = new Set<string>();
      for (const node of data.nodes) {
        if ('assetId' in node && node.assetId) {
          currentSlideAssetIds.add(node.assetId);
        }
        if (
          'bgAssetId' in node &&
          node.bgAssetId &&
          this.isUUID(node.bgAssetId)
        ) {
          currentSlideAssetIds.add(node.bgAssetId);
        }
      }
      this.previousSlideAssetIds = currentSlideAssetIds;
      if (isStale()) return;

      const canvasWidth = this.app.renderer.width;
      const canvasHeight = this.app.renderer.height;
      const sceneWidth = data.sceneBounds?.width || 1920;
      const sceneHeight = data.sceneBounds?.height || 1080;
      const scaleX = canvasWidth / sceneWidth;
      const scaleY = canvasHeight / sceneHeight;
      let scaleFactor = Math.min(scaleX, scaleY);
      if (!isFinite(scaleFactor) || scaleFactor <= 0) {
        scaleFactor = 1;
      }

      const iframeNodes: SerializedIframeNode[] = [];

      for (const nodeData of data.nodes) {
        if (nodeData.type === 'iframe') {
          iframeNodes.push(nodeData as SerializedIframeNode);
          continue;
        }

        const node = await this.nodeFactory.createNodeFromSerialized(nodeData, {
          isCastingMode: true,
          scaleFactor: scaleFactor,
        });
        if (isStale()) return; // после await проверяем, не устарел ли рендер
        if (node) {
          node.x = nodeData.x * scaleFactor;
          node.y = nodeData.y * scaleFactor;
          node.rotation = nodeData.rotation;
          node.alpha = nodeData.alpha ?? 1;
          this.scene.addChild(node);
        }
      }

      const scaledSceneWidth = sceneWidth * scaleFactor;
      const scaledSceneHeight = sceneHeight * scaleFactor;
      this.scene.x = (canvasWidth - scaledSceneWidth) / 2;
      this.scene.y = (canvasHeight - scaledSceneHeight) / 2;

      this.domOverlayRef.nativeElement.innerHTML = '';
      if (isStale()) return;
      for (const iframeData of iframeNodes) {
        const iframe = this.renderer.createElement('iframe');
        this.renderer.setAttribute(iframe, 'src', iframeData.url);
        this.renderer.setStyle(iframe, 'position', 'absolute');
        const absoluteLeft = this.scene.x + iframeData.x * scaleFactor;
        const absoluteTop = this.scene.y + iframeData.y * scaleFactor;
        this.renderer.setStyle(iframe, 'left', `${absoluteLeft}px`);
        this.renderer.setStyle(iframe, 'top', `${absoluteTop}px`);
        this.renderer.setStyle(
          iframe,
          'width',
          `${iframeData.width * scaleFactor}px`
        );
        this.renderer.setStyle(
          iframe,
          'height',
          `${iframeData.height * scaleFactor}px`
        );
        this.renderer.setStyle(iframe, 'border', 'none');
        this.renderer.appendChild(this.domOverlayRef.nativeElement, iframe);
      }
    } catch (e) {
      console.error('[Casting] Failed to render slide content:', e);
    }
  }
}
