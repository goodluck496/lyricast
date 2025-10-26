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
import { combineLatest, filter, map } from 'rxjs';
import { FreeSlide } from '@lyri-cast/entities';
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
import { SerializedState } from '@lyri-cast/entities';

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
        console.log('[Casting] isCasting changed:', isCasting);
        this.hideContent.set(!isCasting);
      });

    combineLatest([
      this.store.select(selectFreeSlideCastingProcess).pipe(filterEmpty()),
      this.store.select(selectFreeSlideNavigateState),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([process, navigate]) => {
        console.log('[Casting] Process received:', process);
        console.log('[Casting] Navigate state:', navigate);
        const slideIndex = navigate?.index ?? process.fromIndex;
        const slide = process.slides[slideIndex];
        console.log('[Casting] Rendering slide at index', slideIndex, ':', slide);
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
      this.app.renderer.resize(
        this.pixiHostRef.nativeElement.clientWidth,
        this.pixiHostRef.nativeElement.clientHeight
      );
    }
  }

  private async initPixi() {
    this.app = new Application();
    await this.app.init({
      resizeTo: this.pixiHostRef.nativeElement,
      background: '#333333', // Серый фон для отладки (было: backgroundAlpha: 0)
      antialias: true,
    });
    this.pixiHostRef.nativeElement.appendChild(this.app.canvas);
    this.scene = new Container();
    this.app.stage.addChild(this.scene);
    console.log('[Casting] PixiJS initialized. Canvas size:', {
      width: this.app.renderer.width,
      height: this.app.renderer.height,
    });
  }

  private async renderSlide(slide: FreeSlide) {
    console.log('[Casting] renderSlide called with slide:', slide.id, slide.name);
    console.log('[Casting] slide.htmlString length:', slide.htmlString?.length);

    // Clear previous content
    this.scene.removeChildren();
    this.domOverlayRef.nativeElement.innerHTML = '';

    if (!slide.htmlString) {
      console.warn('[Casting] No htmlString in slide!');
      return;
    }

    try {
      const data: SerializedState = JSON.parse(slide.htmlString);
      console.log('[Casting] Parsed data:', data);
      console.log('[Casting] Nodes count:', data?.nodes?.length);

      if (!data || !data.nodes) {
        console.warn('[Casting] No data or nodes!');
        return;
      }

      // Вычисляем scale заранее для масштабирования fontSize
      const canvasWidth = this.app.renderer.width;
      const canvasHeight = this.app.renderer.height;

      // Вычисляем bounding box всех нод для определения размера сцены
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const nodeData of data.nodes) {
        minX = Math.min(minX, nodeData.x);
        minY = Math.min(minY, nodeData.y);
        maxX = Math.max(maxX, nodeData.x + nodeData.width);
        maxY = Math.max(maxY, nodeData.y + nodeData.height);
      }

      // Если нет нод или все координаты 0, используем дефолтные размеры
      if (!isFinite(minX) || !isFinite(maxX)) {
        minX = 0;
        maxX = 1920;
      }
      if (!isFinite(minY) || !isFinite(maxY)) {
        minY = 0;
        maxY = 1080;
      }

      const sceneWidth = data.sceneBounds?.width || Math.max(100, maxX - minX);
      const sceneHeight = data.sceneBounds?.height || Math.max(100, maxY - minY);

      // Вычисляем scale factor - используем 95% канваса для небольших отступов
      const scaleX = (canvasWidth * 0.95) / sceneWidth;
      const scaleY = (canvasHeight * 0.95) / sceneHeight;
      let scaleFactor = Math.min(scaleX, scaleY);

      // Защита от некорректных значений
      if (!isFinite(scaleFactor) || scaleFactor <= 0 || scaleFactor > 10) {
        scaleFactor = 1;
        console.warn('[Casting] Invalid scaleFactor, using 1');
      }

      console.log('[Casting] Pre-calculated scale:', {
        canvasWidth,
        canvasHeight,
        sceneWidth,
        sceneHeight,
        minX,
        minY,
        maxX,
        maxY,
        scaleX,
        scaleY,
        scaleFactor,
      });

      for (const nodeData of data.nodes) {
        console.log('[Casting] Rendering node:', nodeData.type, nodeData);
        let node: any;

        switch (nodeData.type) {
          case 'text': {
            // Используем actualFontSize если есть, иначе вычисляем оптимальный размер
            let fontSize = nodeData.actualFontSize;
            if (!fontSize || fontSize === 0) {
              // Fallback: вычисляем fontSize на основе высоты блока
              // Примерно 70% от высоты блока для однострочного текста
              fontSize = Math.max(nodeData.style.min, Math.min(nodeData.style.max, nodeData.height * 0.7));
              console.warn('[Casting] actualFontSize not found, using calculated:', fontSize);
            }

            console.log('[Casting] Creating text node with:', {
              text: nodeData.textHtml,
              style: nodeData.style,
              width: nodeData.width,
              height: nodeData.height,
              fontSize: fontSize,
            });

            // Создаём стиль с оригинальным fontSize
            const style = new HTMLTextStyle({
              fontFamily: nodeData.style.font || 'Arial',
              fontWeight: nodeData.style.weight || 'normal',
              fill: nodeData.style.colorHex || '#FFFFFF',
              fontSize: fontSize,
              align: nodeData.style.align || 'center',
              wordWrap: false,
            });

            node = new HTMLText({ text: nodeData.textHtml, style });

            console.log('[Casting] Text node created:', {
              text: node.text,
              fontSize: style.fontSize,
              bounds: node.getBounds(),
              actualWidth: node.width,
              actualHeight: node.height,
            });
            break;
          }

          case 'image':
          case 'video': {
            const texture = await Assets.load(nodeData.url);
            node = new Sprite(texture);
            node.width = nodeData.width;
            node.height = nodeData.height;
            if (nodeData.type === 'video') {
              const videoSource = node.texture.source as any;
              if (videoSource.resource) {
                videoSource.resource.loop = true;
                videoSource.resource.autoplay = true;
                videoSource.resource.muted = true;
              }
            }
            break;
          }

          case 'shape':
            node = new Graphics();
            if (nodeData.shape === 'rect') {
              node
                .rect(0, 0, nodeData.width, nodeData.height)
                .fill(nodeData.fill);
              node.stroke({
                width: nodeData.lineWidth,
                color: nodeData.stroke,
              });
            } else if (nodeData.shape === 'ellipse') {
              node
                .ellipse(
                  nodeData.width / 2,
                  nodeData.height / 2,
                  nodeData.width / 2,
                  nodeData.height / 2
                )
                .fill(nodeData.fill);
              node.stroke({
                width: nodeData.lineWidth,
                color: nodeData.stroke,
              });
            }
            break;

          case 'brush':
            node = new Graphics();
            if (nodeData.path && nodeData.path.length > 0) {
              node.moveTo(nodeData.path[0].x, nodeData.path[0].y);
              nodeData.path.forEach((p: { x: number; y: number }) =>
                node.lineTo(p.x, p.y)
              );
              node.stroke({
                width: nodeData.strokeWidth,
                color: nodeData.stroke,
                cap: 'round',
                join: 'round',
              });
            }
            break;

          case 'iframe': {
            const iframe = this.renderer.createElement('iframe');
            this.renderer.setAttribute(iframe, 'src', nodeData.url);
            this.renderer.setStyle(iframe, 'position', 'absolute');
            this.renderer.setStyle(iframe, 'left', `${nodeData.x * scaleFactor}px`);
            this.renderer.setStyle(iframe, 'top', `${nodeData.y * scaleFactor}px`);
            this.renderer.setStyle(iframe, 'width', `${nodeData.width * scaleFactor}px`);
            this.renderer.setStyle(iframe, 'height', `${nodeData.height * scaleFactor}px`);
            this.renderer.setStyle(iframe, 'border', 'none');
            this.renderer.appendChild(this.domOverlayRef.nativeElement, iframe);
            break;
          }
        }

        if (node) {
          // Используем оригинальные координаты без масштабирования
          node.x = nodeData.x;
          node.y = nodeData.y;
          node.rotation = nodeData.rotation;
          node.alpha = nodeData.alpha;

          console.log('[Casting] Adding node to scene at position:', {
            x: node.x,
            y: node.y,
            width: nodeData.width,
            height: nodeData.height,
            rotation: node.rotation,
            alpha: node.alpha,
          });
          this.scene.addChild(node);

          // DEBUG: Добавляем красный прямоугольник вокруг текста для отладки
          if (nodeData.type === 'text') {
            const debugRect = new Graphics();
            debugRect.rect(
              nodeData.x,
              nodeData.y,
              nodeData.width,
              nodeData.height
            );
            debugRect.stroke({ width: 2, color: 0xff0000 }); // Красная рамка
            this.scene.addChild(debugRect);
            console.log('[Casting] DEBUG: Added red rectangle at:', {
              x: nodeData.x,
              y: nodeData.y,
              width: nodeData.width,
              height: nodeData.height,
            });
          }
        } else {
          console.warn('[Casting] Node is null/undefined for:', nodeData.type);
        }
      }

      console.log('[Casting] Finished rendering. Scene children count:', this.scene.children.length);

      // Применяем масштабирование ко всей сцене
      this.scene.scale.set(scaleFactor, scaleFactor);
      console.log('[Casting] Scene scaled by:', scaleFactor);

      // Центрируем сцену на canvas
      const bounds = this.scene.getBounds();
      console.log('[Casting] Scene bounds after scaling:', bounds);

      this.scene.x = (canvasWidth - bounds.width) / 2 - bounds.x;
      this.scene.y = (canvasHeight - bounds.height) / 2 - bounds.y;

      console.log('[Casting] Scene centered at:', { x: this.scene.x, y: this.scene.y });
      console.log('[Casting] App stage size:', {
        width: this.app.renderer.width,
        height: this.app.renderer.height,
      });
    } catch (e) {
      console.error('[Casting] Failed to render slide content:', e);
    }
  }
}
