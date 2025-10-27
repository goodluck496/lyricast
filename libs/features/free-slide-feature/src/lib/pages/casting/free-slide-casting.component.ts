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
import { FreeSlide, SerializedNode } from '@lyri-cast/entities';
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
} from 'pixi.js';
import { SerializedState, SerializedIframeNode } from '@lyri-cast/entities';
import { ViewContainer } from 'pixi.js/lib/scene/view/ViewContainer';

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

  @ViewChild('pixiHost', { static: true })
  pixiHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('domOverlay', { static: true })
  domOverlayRef!: ElementRef<HTMLDivElement>;

  private app!: Application;
  private scene!: Container;

  hideContent = signal(false);

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
      const newWidth = this.pixiHostRef.nativeElement.clientWidth || window.innerWidth;
      const newHeight = this.pixiHostRef.nativeElement.clientHeight || window.innerHeight;

      console.log('[Casting] Resizing renderer to:', { newWidth, newHeight });

      this.app.renderer.resize(newWidth, newHeight);

      // Перерисовываем текущий слайд с новыми размерами
      // Получаем текущий слайд из стора
      this.store.select(selectFreeSlideCastingProcess).pipe(
        filterEmpty(),
        take(1)
      ).subscribe((process) => {
        this.store.select(selectFreeSlideNavigateState).pipe(take(1)).subscribe((navigate) => {
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
    const containerWidth = this.pixiHostRef.nativeElement.clientWidth || window.innerWidth;
    const containerHeight = this.pixiHostRef.nativeElement.clientHeight || window.innerHeight;

    console.log('[Casting] initPixi - container dimensions:', {
      clientWidth: this.pixiHostRef.nativeElement.clientWidth,
      clientHeight: this.pixiHostRef.nativeElement.clientHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      using: { width: containerWidth, height: containerHeight }
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
      height: this.app.renderer.height
    });
  }

  private async renderSlide(slide: FreeSlide) {
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

      if (!data || !data.nodes) {
        console.warn('[Casting] No data or nodes!');
        return;
      }

      // --- PRE-LOADING STAGE ---
      const urlsToLoad: string[] = [];
      for (const node of data.nodes) {
        if ((node.type === 'image' || node.type === 'video') && (node as any).url) {
          urlsToLoad.push((node as any).url);
        }
        if (node.type === 'text' && (node as any).bgImageUrl) {
          urlsToLoad.push((node as any).bgImageUrl);
        }
      }

      if (urlsToLoad.length > 0) {
        const uniqueUrls = [...new Set(urlsToLoad)];
        console.log('[Casting] Pre-loading assets:', uniqueUrls);
        await Assets.load(uniqueUrls);
        console.log('[Casting] Assets loaded.');
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

        switch (nodeData.type) {
          case 'text': {
            const scaledWidth = nodeData.width * scaleFactor;
            const scaledHeight = nodeData.height * scaleFactor;
            const x = nodeData.x * scaleFactor;
            const y = nodeData.y * scaleFactor;

            if (nodeData.bgImageUrl) {
              try {
                const bgTexture = Assets.get(nodeData.bgImageUrl);
                const bgSprite = new Sprite(bgTexture);
                const scaleToCover = Math.max(scaledWidth / bgTexture.width, scaledHeight / bgTexture.height);
                bgSprite.scale.set(scaleToCover);
                bgSprite.anchor.set(0.5);
                bgSprite.x = x + scaledWidth / 2;
                bgSprite.y = y + scaledHeight / 2;
                bgSprite.alpha = nodeData.alpha ?? 1;

                const mask = new Graphics();
                mask.roundRect(x, y, scaledWidth, scaledHeight, 6 * scaleFactor).fill(0xffffff);
                bgSprite.mask = mask;

                this.scene.addChild(bgSprite, mask);
              } catch (e) {
                console.warn('[Casting] Failed to get text background image:', nodeData.bgImageUrl, e);
              }
            } else if (nodeData.bgFillColor != null) {
              const bgGraphics = new Graphics();
              bgGraphics.roundRect(x, y, scaledWidth, scaledHeight, 6 * scaleFactor)
                        .fill(nodeData.bgFillColor);
              bgGraphics.alpha = nodeData.alpha ?? 1;
              this.scene.addChild(bgGraphics);
            }

            let fontSize = nodeData.actualFontSize;
            if (!fontSize || fontSize === 0) {
              fontSize = Math.max(nodeData.style.min, Math.min(nodeData.style.max, nodeData.height * 0.7));
            }
            const scaledFontSize = fontSize * scaleFactor;
            const style = new HTMLTextStyle({
              fontFamily: nodeData.style.font || 'Arial',
              fontWeight: nodeData.style.weight || 'normal',
              fill: nodeData.style.colorHex || '#FFFFFF',
              fontSize: scaledFontSize,
              align: nodeData.style.align || 'center',
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
            const anchorX = align === 'center' ? 0.5 : align === 'right' ? 1 : 0;
            const valign = (nodeData.style as any).valign || 'top';
            const anchorY = valign === 'middle' ? 0.5 : valign === 'bottom' ? 1 : 0;
            node.anchor.set(anchorX, anchorY);
            break;
          }

          case 'image':
          case 'video': {
            try {
              const texture = Assets.get(nodeData.url);
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
              console.error(`[Casting] Failed to get ${nodeData.type}:`, nodeData.url, e);
            }
            break;
          }

          case 'shape':
            node = new Graphics();
            if (nodeData.shape === 'rect') {
              node.rect(0, 0, nodeData.width * scaleFactor, nodeData.height * scaleFactor).fill(nodeData.fill);
              node.stroke({ width: nodeData.lineWidth * scaleFactor, color: nodeData.stroke });
            } else if (nodeData.shape === 'ellipse') {
              node.ellipse((nodeData.width / 2) * scaleFactor, (nodeData.height / 2) * scaleFactor, (nodeData.width / 2) * scaleFactor, (nodeData.height / 2) * scaleFactor).fill(nodeData.fill);
              node.stroke({ width: nodeData.lineWidth * scaleFactor, color: nodeData.stroke });
            }
            break;

          case 'brush':
            node = new Graphics();
            if (nodeData.path && nodeData.path.length > 0) {
              node.moveTo(nodeData.path[0].x * scaleFactor, nodeData.path[0].y * scaleFactor);
              nodeData.path.forEach((p: { x: number; y: number }) => node.lineTo(p.x * scaleFactor, p.y * scaleFactor));
              node.stroke({ width: nodeData.strokeWidth * scaleFactor, color: nodeData.stroke, cap: 'round', join: 'round' });
            }
            break;

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

      console.log('[Casting] Scene position:', { x: this.scene.x, y: this.scene.y });

      for (const iframeData of iframeNodes) {
        const iframe = this.renderer.createElement('iframe');
        this.renderer.setAttribute(iframe, 'src', iframeData.url);
        this.renderer.setStyle(iframe, 'position', 'absolute');
        const absoluteLeft = this.scene.x + iframeData.x * scaleFactor;
        const absoluteTop = this.scene.y + iframeData.y * scaleFactor;
        this.renderer.setStyle(iframe, 'left', `${absoluteLeft}px`);
        this.renderer.setStyle(iframe, 'top', `${absoluteTop}px`);
        this.renderer.setStyle(iframe, 'width', `${iframeData.width * scaleFactor}px`);
        this.renderer.setStyle(iframe, 'height', `${iframeData.height * scaleFactor}px`);
        this.renderer.setStyle(iframe, 'border', 'none');
        this.renderer.appendChild(this.domOverlayRef.nativeElement, iframe);
      }
    } catch (e) {
      console.error('[Casting] Failed to render slide content:', e);
    }
  }
}
