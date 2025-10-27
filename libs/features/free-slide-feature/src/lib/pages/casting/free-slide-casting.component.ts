import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
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
} from '@lyri-cast/free-slide-store';
import { AppActions, BridgeService, Pages } from '@lyri-cast/common-browser';

import { filterEmpty } from '@lyri-cast/common';
import { combineLatest, filter, map, take } from 'rxjs';
import {
  FreeSlide,
  SerializedIframeNode,
  SerializedImageNode,
  SerializedState,
  SerializedVideoNode,
} from '@lyri-cast/entities';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Actions, ofType } from '@ngrx/effects';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import {
  Application,
  Assets,
  Container,
  Graphics,
  HTMLText,
  HTMLTextStyle,
  Sprite,
  Texture,
} from 'pixi.js';
import { ViewContainer } from 'pixi.js/lib/scene/view/ViewContainer';
import { AssetStorageService } from '@lyri-cast/form';

@Component({
  selector: 'lyri-free-slide-casting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './free-slide-casting.component.html',
  styleUrls: ['./free-slide-casting.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeSlideCastingComponent implements OnInit, AfterViewInit {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly bridge = inject(BridgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly renderer = inject(Renderer2);
  private readonly assetStorage = inject(AssetStorageService);

  @ViewChild('pixiHost', { static: true })
  pixiHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('domOverlay', { static: true })
  domOverlayRef!: ElementRef<HTMLDivElement>;

  private app!: Application;
  private scene!: Container;

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

    combineLatest([
      this.store.select(selectFreeSlideCastingProcess).pipe(filterEmpty()),
      this.store.select(selectFreeSlideNavigateState),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([process, navigate]) => {
        const slideIndex = navigate?.index ?? process.fromIndex;
        const slide = process.slides[slideIndex];
        if (slide) {
          this.renderSlide(slide);
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
    await this.initPixi();
    this.bridge.windowSrv.electronContext.send({
      event: 'OPENED_PAGE',
      payload: { state: 'after-view-init', page: Pages.CASTING },
    });
  }

  @HostListener('window:resize', ['$event'])
  resizeHandler() {
    if (this.app) {
      const newWidth =
        this.pixiHostRef.nativeElement.clientWidth || window.innerWidth;
      const newHeight =
        this.pixiHostRef.nativeElement.clientHeight || window.innerHeight;

      console.log('[Casting] Resizing renderer to:', { newWidth, newHeight });

      this.app.renderer.resize(newWidth, newHeight);

      // Перерисовываем текущий слайд с новыми размерами
      // Получаем текущий слайд из стора
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

  private async initPixi() {
    this.app = new Application();

    // Получаем реальные размеры контейнера
    const containerWidth =
      this.pixiHostRef.nativeElement.clientWidth || window.innerWidth;
    const containerHeight =
      this.pixiHostRef.nativeElement.clientHeight || window.innerHeight;

    console.log('[Casting] initPixi - container dimensions:', {
      clientWidth: this.pixiHostRef.nativeElement.clientWidth,
      clientHeight: this.pixiHostRef.nativeElement.clientHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      using: { width: containerWidth, height: containerHeight },
    });

    await this.app.init({
      width: containerWidth,
      height: containerHeight,
      backgroundAlpha: 0, // Прозрачный фон
      antialias: true,
      // НЕ используем resizeTo при инициализации, т.к. элемент может быть 0x0
    });

    this.pixiHostRef.nativeElement.appendChild(this.app.canvas);
    this.scene = new Container();
    this.app.stage.addChild(this.scene);

    console.log('[Casting] PixiJS initialized with renderer size:', {
      width: this.app.renderer.width,
      height: this.app.renderer.height,
    });
  }

  private async renderSlide(slide: FreeSlide) {
    console.log('[Casting] renderSlide called with slide:', slide);
    // Clear previous content and reset scale
    this.scene.removeChildren();
    this.scene.scale.set(1, 1);
    this.scene.position.set(0, 0);
    this.domOverlayRef.nativeElement.innerHTML = '';

    if (!slide.htmlString) {
      console.warn('[Casting] No htmlString in slide!');
      return;
    }

    try {
      const data: SerializedState = JSON.parse(slide.htmlString);
      console.log('[Casting] Deserialized slide data:', data);

      if (!data || !data.nodes) {
        console.warn('[Casting] No data or nodes!');
        return;
      }

      // --- PRE-LOADING STAGE ---
      const urlsToLoad: string[] = [];
      for (const node of data.nodes) {
        if (node.type === 'image' || node.type === 'video') {
          if (node.assetId) {
            const objectURL = await this.assetStorage.getAssetObjectURL(
              node.assetId
            );
            if (objectURL) urlsToLoad.push(objectURL);
          } else if (node.url) {
            urlsToLoad.push(node.url);
          }
        }
        if (node.type === 'text' && node.bgAssetId) {
          let sourceIdentifier = node.bgAssetId;
          if (this.isUUID(sourceIdentifier)) {
            const objectURL = await this.assetStorage.getAssetObjectURL(
              sourceIdentifier
            );
            if (objectURL) urlsToLoad.push(objectURL);
          } else {
            // It's already a direct URL (http, https, data, blob)
            urlsToLoad.push(sourceIdentifier);
          }
        }
        if (node.type === 'shape' && node.bgAssetId) {
          let sourceIdentifier = node.bgAssetId;
          if (this.isUUID(sourceIdentifier)) {
            const objectURL = await this.assetStorage.getAssetObjectURL(
              sourceIdentifier
            );
            if (objectURL) urlsToLoad.push(objectURL);
          } else {
            // It's already a direct URL (http, https, data, blob)
            urlsToLoad.push(sourceIdentifier);
          }
        }
        if (node.type === 'brush' && node.bgAssetId) {
          let sourceIdentifier = node.bgAssetId;
          if (this.isUUID(sourceIdentifier)) {
            const objectURL = await this.assetStorage.getAssetObjectURL(
              sourceIdentifier
            );
            if (objectURL) urlsToLoad.push(objectURL);
          } else {
            // It's already a direct URL (http, https, data, blob)
            urlsToLoad.push(sourceIdentifier);
          }
        }
      }

      if (urlsToLoad.length > 0) {
        const uniqueUrls = [
          ...new Set(urlsToLoad.filter((url) => !url.startsWith('blob:'))),
        ];
        if (uniqueUrls.length > 0) {
          await Assets.load(uniqueUrls);
        }
      }

      // --- SYNCHRONOUS BUILD STAGE ---
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
        let node: any | ViewContainer;

        let bgSource: string | undefined;
        switch (nodeData.type) {
          case 'text': {
            const scaledWidth = nodeData.width * scaleFactor;
            const scaledHeight = nodeData.height * scaleFactor;
            const x = nodeData.x * scaleFactor;
            const y = nodeData.y * scaleFactor;

            if (nodeData.bgAssetId) {
              const sourceIdentifier = nodeData.bgAssetId;
              let bgSource: string | undefined;
              if (this.isUUID(sourceIdentifier)) {
                bgSource = await this.assetStorage.getAssetObjectURL(
                  sourceIdentifier
                );
              } else {
                bgSource = sourceIdentifier; // It's already a direct URL
              }

              if (bgSource) {
                try {
                  const bgTexture = await loadTextureRobustCasting(
                    bgSource,
                    'background'
                  );
                  const bgSprite = new Sprite(bgTexture);
                  const scaleToCover = Math.max(
                    scaledWidth / bgTexture.width,
                    scaledHeight / bgTexture.height
                  );
                  bgSprite.scale.set(scaleToCover);
                  bgSprite.anchor.set(0.5);
                  bgSprite.x = x + scaledWidth / 2;
                  bgSprite.y = y + scaledHeight / 2;
                  bgSprite.alpha = nodeData.alpha ?? 1;

                  const mask = new Graphics();
                  mask
                    .roundRect(x, y, scaledWidth, scaledHeight, 6 * scaleFactor)
                    .fill(0xffffff);
                  bgSprite.mask = mask;

                  this.scene.addChild(bgSprite, mask);
                } catch (e) {
                  console.warn(
                    '[Casting] Failed to get text background image:',
                    bgSource,
                    e
                  );
                }
              } else if (nodeData.bgFillColor != null) {
                const bgGraphics = new Graphics();
                bgGraphics
                  .roundRect(x, y, scaledWidth, scaledHeight, 6 * scaleFactor)
                  .fill(nodeData.bgFillColor);
                bgGraphics.alpha = nodeData.alpha ?? 1;
                this.scene.addChild(bgGraphics);
              }

              let fontSize = nodeData.actualFontSize;
              if (!fontSize || fontSize === 0) {
                fontSize = Math.max(
                  nodeData.style.min,
                  Math.min(nodeData.style.max, nodeData.height * 0.7)
                );
              }
              const scaledFontSize = fontSize * scaleFactor;
              const style = new HTMLTextStyle({
                fontFamily: nodeData.style.font || 'Arial',
                fontWeight: nodeData.style.weight || 'normal',
                                            fill: nodeData.style.colorHex || '#FFFFFF',
                                            fontSize: scaledFontSize,                align: nodeData.style.align || 'center',
                wordWrap: true,
                wordWrapWidth: scaledWidth,
                lineHeight: scaledFontSize * (nodeData.style.lineHeight || 1.2),
                cssOverrides: [
                  'p { margin: 0; }',
                  'ul, ol { margin: 0; padding-left: 70px; list-style-position: outside; }',
                ],
              });

              node = new HTMLText({ text: nodeData.textHtml, style });

              const align = nodeData.style.align || 'center';
              const anchorX =
                align === 'center' ? 0.5 : align === 'right' ? 1 : 0;
              const valign = nodeData.style.valign || 'top';
              const anchorY =
                valign === 'middle' ? 0.5 : valign === 'bottom' ? 1 : 0;
              node.anchor.set(anchorX, anchorY);
            }
            break;
          }
          case 'image':
          case 'video': {
            const nodeDataNew = nodeData as
              | SerializedImageNode
              | SerializedVideoNode;
            let source: string | undefined;
            if (nodeDataNew.assetId) {
              source = await this.assetStorage.getAssetObjectURL(
                nodeDataNew.assetId
              );
            } else if (nodeDataNew.url) {
              source = nodeDataNew.url;
            }

            if (!source) {
              console.warn(
                `[Casting] ${nodeDataNew.type} node without assetId or url.`
              );
              break;
            }

            try {
              const texture = await loadTextureRobustCasting(
                source,
                nodeDataNew.type
              );
              node = new Sprite(texture);
              node.width = nodeData.width * scaleFactor;
              node.height = nodeData.height * scaleFactor;
              if (nodeData.type === 'video') {
                const videoSource = node.texture.source as any;
                if (videoSource.resource) {
                  videoSource.resource.loop = true;
                  videoSource.resource.autoplay = true;
                  videoSource.resource.muted = true;
                }
              }
            } catch (e) {
              console.error(
                `[Casting] Failed to get ${nodeData.type}:`,
                source,
                e
              );
            }
            break;
          }

          case 'shape': {
            const scaledWidth = nodeData.width * scaleFactor;
            const scaledHeight = nodeData.height * scaleFactor;
            const x = nodeData.x * scaleFactor;
            const y = nodeData.y * scaleFactor;

            const shapeContainer = new Container(); // Use a container to group shape graphics and background
            shapeContainer.x = x;
            shapeContainer.y = y;

            const mainGraphics = new Graphics(); // For fill and stroke
            shapeContainer.addChild(mainGraphics);

            let bgSource: string | undefined;
            if (nodeData.bgAssetId) {
              let sourceIdentifier = nodeData.bgAssetId;
              if (this.isUUID(sourceIdentifier)) {
                console.log(
                  `[Casting] Shape node ${nodeData.id} has bgAssetId (UUID): ${sourceIdentifier}`
                );
                bgSource = await this.assetStorage.getAssetObjectURL(
                  sourceIdentifier
                );
                console.log(
                  `[Casting] Shape node ${nodeData.id} resolved object URL: ${bgSource}`
                );
              } else {
                console.log(
                  `[Casting] Shape node ${nodeData.id} has bgAssetId (direct URL): ${sourceIdentifier}`
                );
                bgSource = sourceIdentifier; // It's already a direct URL
              }
            }

            if (bgSource) {
              try {
                console.log(
                  `[Casting] Calling loadTextureRobustCasting for shape ${nodeData.id} with URL: ${bgSource}`
                );
                const bgTexture = await loadTextureRobustCasting(
                  bgSource,
                  'background'
                );
                console.log(
                  `[Casting] loadTextureRobustCasting for shape ${nodeData.id} returned texture:`,
                  bgTexture
                );
                if (!bgTexture || ('valid' in bgTexture && !bgTexture.valid))
                  console.error('[Casting Debug] Shape bgTexture invalid!');
                const bgSprite = new Sprite(bgTexture);
                const scaleToCover = Math.max(
                  scaledWidth / bgTexture.width,
                  scaledHeight / bgTexture.height
                );
                bgSprite.scale.set(scaleToCover);
                bgSprite.anchor.set(0.5);
                bgSprite.x = scaledWidth / 2; // Position relative to container
                bgSprite.y = scaledHeight / 2; // Position relative to container
                bgSprite.alpha = nodeData.alpha ?? 1;

                const maskGraphics = new Graphics();
                if (nodeData.shape === 'rect') {
                  maskGraphics
                    .roundRect(0, 0, scaledWidth, scaledHeight, 6 * scaleFactor)
                    .fill(0xffffff);
                } else if (nodeData.shape === 'ellipse') {
                  maskGraphics
                    .ellipse(
                      scaledWidth / 2,
                      scaledHeight / 2,
                      scaledWidth / 2,
                      scaledHeight / 2
                    )
                    .fill(0xffffff);
                }
                bgSprite.mask = maskGraphics;
                shapeContainer.addChildAt(bgSprite, 0); // Add sprite behind main graphics
                shapeContainer.addChild(maskGraphics); // Add mask to container
              } catch (e) {
                console.warn(
                  '[Casting] Failed to get shape background image:',
                  bgSource,
                  e
                );
              }
            } else {
              // Render solid fill if no background image
              if (nodeData.shape === 'rect') {
                mainGraphics
                  .roundRect(0, 0, scaledWidth, scaledHeight, 6 * scaleFactor)
                  .fill(nodeData.fill);
              } else if (nodeData.shape === 'ellipse') {
                mainGraphics
                  .ellipse(
                    scaledWidth / 2,
                    scaledHeight / 2,
                    scaledWidth / 2,
                    scaledHeight / 2
                  )
                  .fill(nodeData.fill);
              }
            }

            // Always render stroke
            if (nodeData.shape === 'rect') {
              mainGraphics
                .roundRect(0, 0, scaledWidth, scaledHeight, 6 * scaleFactor)
                .stroke({
                  width: nodeData.lineWidth * scaleFactor,
                  color: nodeData.stroke,
                });
            } else if (nodeData.shape === 'ellipse') {
              mainGraphics
                .ellipse(
                  scaledWidth / 2,
                  scaledHeight / 2,
                  scaledWidth / 2,
                  scaledHeight / 2
                )
                .stroke({
                  width: nodeData.lineWidth * scaleFactor,
                  color: nodeData.stroke,
                });
            } else if (nodeData.shape === 'line') {
              mainGraphics
                .moveTo(0, 0)
                .lineTo(scaledWidth, 0)
                .stroke({
                  width: nodeData.lineWidth * scaleFactor,
                  color: nodeData.stroke,
                });
            }

            node = shapeContainer; // Assign the container to node
            break;
          }

          case 'brush': {
            const scaledWidth = nodeData.width * scaleFactor;
            const scaledHeight = nodeData.height * scaleFactor;
            const x = nodeData.x * scaleFactor;
            const y = nodeData.y * scaleFactor;

            const brushContainer = new Container();
            brushContainer.x = x;
            brushContainer.y = y;

            const mainGraphics = new Graphics(); // For the brush stroke
            brushContainer.addChild(mainGraphics);

            let bgSource: string | undefined;
            if (nodeData.bgAssetId) {
              let sourceIdentifier = nodeData.bgAssetId;
              if (this.isUUID(sourceIdentifier)) {
                console.log(
                  `[Casting] Brush node ${nodeData.id} has bgAssetId (UUID): ${sourceIdentifier}`
                );
                bgSource = await this.assetStorage.getAssetObjectURL(
                  sourceIdentifier
                );
                console.log(
                  `[Casting] Brush node ${nodeData.id} resolved object URL: ${bgSource}`
                );
              } else {
                console.log(
                  `[Casting] Brush node ${nodeData.id} has bgAssetId (direct URL): ${sourceIdentifier}`
                );
                bgSource = sourceIdentifier; // It's already a direct URL
              }
            }

            if (bgSource && nodeData.path && nodeData.path.length > 0) {
              try {
                console.log(
                  `[Casting] Calling loadTextureRobustCasting for brush ${nodeData.id} with URL: ${bgSource}`
                );
                const bgTexture = await loadTextureRobustCasting(
                  bgSource,
                  'background'
                );
                console.log(
                  `[Casting] loadTextureRobustCasting for brush ${nodeData.id} returned texture:`,
                  bgTexture
                );
                if (!bgTexture || ('valid' in bgTexture && !bgTexture.valid))
                  console.error('[Casting Debug] Brush bgTexture invalid!');
                const bgSprite = new Sprite(bgTexture);
                const scaleToCover = Math.max(
                  scaledWidth / bgTexture.width,
                  scaledHeight / bgTexture.height
                );
                bgSprite.scale.set(scaleToCover);
                bgSprite.anchor.set(0.5);
                bgSprite.x = scaledWidth / 2;
                bgSprite.y = scaledHeight / 2;
                bgSprite.alpha = nodeData.alpha ?? 1;

                const maskGraphics = new Graphics();
                maskGraphics.moveTo(
                  nodeData.path[0].x * scaleFactor,
                  nodeData.path[0].y * scaleFactor
                );
                nodeData.path.forEach((p: { x: number; y: number }) =>
                  maskGraphics.lineTo(p.x * scaleFactor, p.y * scaleFactor)
                );
                maskGraphics.closePath(); // Assume closed path for background
                maskGraphics.fill(0xffffff);

                bgSprite.mask = maskGraphics;
                brushContainer.addChildAt(bgSprite, 0);
                brushContainer.addChild(maskGraphics);
              } catch (e) {
                console.warn(
                  '[Casting] Failed to get brush background image:',
                  bgSource,
                  e
                );
              }
            }

            // Render brush stroke
            if (nodeData.path && nodeData.path.length > 0) {
              mainGraphics.moveTo(
                nodeData.path[0].x * scaleFactor,
                nodeData.path[0].y * scaleFactor
              );
              nodeData.path.forEach((p: { x: number; y: number }) =>
                mainGraphics.lineTo(p.x * scaleFactor, p.y * scaleFactor)
              );
              mainGraphics.stroke({
                width: nodeData.strokeWidth * scaleFactor,
                color: nodeData.stroke,
                cap: 'round',
                join: 'round',
              });
            }

            node = brushContainer;
            break;
          }

          case 'iframe': {
            iframeNodes.push(nodeData as SerializedIframeNode);
            break;
          }
        }

        if (node) {
          if (nodeData.type === 'text') {
            const anchorX = node.anchor.x;
            const anchorY = node.anchor.y;
            node.x = (nodeData.x + nodeData.width * anchorX) * scaleFactor;
            node.y = (nodeData.y + nodeData.height * anchorY) * scaleFactor;
          } else {
            node.x = nodeData.x * scaleFactor;
            node.y = nodeData.y * scaleFactor;
          }
          node.rotation = nodeData.rotation;
          node.alpha = nodeData.alpha;
          this.scene.addChild(node);
        }
      }

      const scaledSceneWidth = sceneWidth * scaleFactor;
      const scaledSceneHeight = sceneHeight * scaleFactor;
      this.scene.x = (canvasWidth - scaledSceneWidth) / 2;
      this.scene.y = (canvasHeight - scaledSceneHeight) / 2;

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

async function loadTextureRobustCasting(
  url: string,
  type: 'image' | 'video' | 'background'
): Promise<Texture> {
  console.log(`[Casting] Attempting to load texture: ${url}, type: ${type}`);

  // 1) Try direct Texture.from (string URL)
  console.log(`[Casting] Trying Texture.from for ${url}`);
  try {
    const t = Texture.from(url);
    if (t) {
      console.log(`[Casting] Texture.from successful for ${url}`);
      // For video, ensure it's loaded
      if (type === 'video') {
        const videoResource = (t.baseTexture as any)?.resource;
        if (videoResource && videoResource.source instanceof HTMLVideoElement) {
          await new Promise<void>((resolve, reject) => {
            videoResource.source.onloadeddata = resolve;
            videoResource.source.onerror = reject;
            if (videoResource.source.readyState >= 2) resolve(); // Already loaded enough
          });
        }
      }
      return t;
    }
  } catch (e) {
    console.warn(`[Casting] Texture.from(${url}) failed:`, e);
  }

  // 2) Manual HTMLImage/HTMLVideo decode as a last resort (works great for blob:/data:)
  console.log(`[Casting] Trying manual HTML element loading for ${url}`);
  try {
    if (type === 'video') {
      const videoElement = document.createElement('video');
      videoElement.src = url;
      videoElement.autoplay = true;
      videoElement.loop = true;
      videoElement.muted = true;
      await new Promise((resolve, reject) => {
        videoElement.onloadeddata = resolve;
        videoElement.onerror = reject;
      });
      const texture = Texture.from(videoElement);
      console.log(`[Casting] Manual video texture successful for ${url}`);
      return texture;
    } else {
      // image or background
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          console.log(`[Casting] HTMLImageElement loaded for ${url}`);
          resolve();
        };
        img.onerror = (e) => {
          console.error(
            `[Casting] HTMLImageElement failed to load for ${url}:`,
            e
          );
          reject(e);
        };
      });
      const texture = Texture.from(img);
      console.log(`[Casting] Manual image texture successful for ${url}`);
      return texture;
    }
  } catch (e) {
    console.warn(`[Casting] Manual HTML element loading for ${url} failed:`, e);
  }

  throw new Error('[Casting] Failed to load texture from URL: ' + url);
}
