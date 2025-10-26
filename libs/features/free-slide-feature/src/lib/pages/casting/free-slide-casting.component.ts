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

// Типы для десериализации состояния. Должны быть синхронизированы с редактором.
type SerializedNodeBase = {
  id: string;
  type: 'text' | 'image' | 'video' | 'iframe' | 'shape' | 'brush' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  alpha: number;
};

type SerializedTextNode = SerializedNodeBase & {
  type: 'text';
  textHtml: string;
  style: any;
}; // style: UiTextStyles
type SerializedImageNode = SerializedNodeBase & { type: 'image'; url: string };
type SerializedVideoNode = SerializedNodeBase & { type: 'video'; url: string };
type SerializedIframeNode = SerializedNodeBase & {
  type: 'iframe';
  url: string;
};
type SerializedShapeNode = SerializedNodeBase & {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  fill: number;
  stroke: number;
  lineWidth: number;
};
type SerializedBrushNode = SerializedNodeBase & {
  type: 'brush';
  stroke: number;
  strokeWidth: number;
  path: { x: number; y: number }[];
};

type SerializedNode =
  | SerializedTextNode
  | SerializedImageNode
  | SerializedVideoNode
  | SerializedIframeNode
  | SerializedShapeNode
  | SerializedBrushNode;

type SerializedState = {
  nodes: SerializedNode[];
  zoom: number;
};

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
      backgroundAlpha: 0,
      antialias: true,
    });
    this.pixiHostRef.nativeElement.appendChild(this.app.canvas);
    this.scene = new Container();
    this.app.stage.addChild(this.scene);
  }

  private async renderSlide(slide: FreeSlide) {
    // Clear previous content
    this.scene.removeChildren();
    this.domOverlayRef.nativeElement.innerHTML = '';

    if (!slide.htmlString) return;

    try {
      const data: SerializedState = JSON.parse(slide.htmlString);
      if (!data || !data.nodes) return;

      for (const nodeData of data.nodes) {
        let node: any;

        switch (nodeData.type) {
          case 'text': {
            const style = new HTMLTextStyle({
              ...nodeData.style,
              fill: nodeData.style.colorHex,
              fontSize: nodeData.style.max, // Use max font size for casting
              wordWrap: true,
              wordWrapWidth: nodeData.width,
            });
            node = new HTMLText({ text: nodeData.textHtml, style });
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
            this.renderer.setStyle(iframe, 'left', `${nodeData.x}px`);
            this.renderer.setStyle(iframe, 'top', `${nodeData.y}px`);
            this.renderer.setStyle(iframe, 'width', `${nodeData.width}px`);
            this.renderer.setStyle(iframe, 'height', `${nodeData.height}px`);
            this.renderer.setStyle(iframe, 'border', 'none');
            this.renderer.appendChild(this.domOverlayRef.nativeElement, iframe);
            break;
          }
        }

        if (node) {
          node.x = nodeData.x;
          node.y = nodeData.y;
          node.rotation = nodeData.rotation;
          node.alpha = nodeData.alpha;
          // For graphics, pivot needs to be set for rotation to work as expected
          if (node instanceof Graphics) {
            node.pivot.set(nodeData.width / 2, nodeData.height / 2);
            node.position.set(
              nodeData.x + nodeData.width / 2,
              nodeData.y + nodeData.height / 2
            );
          }
          this.scene.addChild(node);
        }
      }
    } catch (e) {
      console.error('Failed to render slide content:', e);
    }
  }
}
