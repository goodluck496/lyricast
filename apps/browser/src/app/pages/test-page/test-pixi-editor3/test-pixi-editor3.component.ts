import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Point,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { DEFAULT_CONFIG, EDITOR_CONFIG } from './types';
import { EDITOR_PLUGINS, EditorContext, NodeBase } from './core';
import { EditorStore, NodeState } from './services/editor-store.service';
import {
  CommandBusService,
  EditorCommand,
} from './services/command-bus.service';
import { EditorUtilsService } from './services/editor-utils.service';
import { TextFitService } from './services/text-fit.service';
import { DialogService } from './services/dialog.service';
import { DragResizeService } from './services/drag-resize.service';
import { OverlayService } from './services/overlay.service';
import { HistoryService } from './services/history.service';
import {
  BatchCommand,
  DuplicateNodesCommand,
  RemoveNodeCommand,
} from './services/history-commands';
import { GuideLayer } from './guides';
import {
  BrushPlugin,
  ClipboardPlugin,
  GroupingPlugin,
  IframePlugin,
  MediaPlugin,
  ShapesPlugin,
  TextPlugin,
} from './plugins';
import { fromEvent, Subject } from 'rxjs';
import { ContextMenuService } from './services/context-menu.service';
import { auditTime, filter, takeUntil, tap } from 'rxjs/operators';
import {
  BrushNode,
  GroupNode,
  IframeNode,
  ImageNode,
  ShapeNode,
  TextNode,
  VideoNode,
} from './nodes';
import { HTML_EDITOR_COMPONENT, HtmlEditorComponent } from '@lyri-cast/form';

type WorldContainer = Container & { app: Application };

@Component({
  selector: 'lyri-pixi-slide-editor-v2',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <ng-container *ngIf="vm$ | async as vm">
      <div class="toolbar">
        <button
          (click)="emit({ t: 'ADD_TEXT', x: 100, y: 80 })"
          [class.active]="selectedKind === 'text'"
        >
          Text
        </button>
        <button (click)="onImageUrl()">Image</button>
        <button (click)="onVideoUrl()">Video</button>
        <button (click)="onIframeUrl()">Iframe</button>
        <span class="sep"></span>

        <button
          (click)="emit({ t: 'ADD_SHAPE', shape: 'rect', x: 120, y: 120 })"
        >
          Rect
        </button>
        <button
          (click)="emit({ t: 'ADD_SHAPE', shape: 'ellipse', x: 140, y: 140 })"
        >
          Ellipse
        </button>
        <button
          (click)="
            emit({
              t: 'ADD_SHAPE',
              shape: 'line',
              x: 160,
              y: 160,
              w: 220,
              h: 1
            })
          "
        >
          Line
        </button>
        <button
          (click)="emit({ t: 'START_BRUSH' })"
          [class.active]="brushActive"
        >
          Brush
        </button>
        <span class="sep"></span>

        <button (click)="onSetBackground()" [disabled]="!canSetBg">
          BG Image…
        </button>
        <button (click)="onClearBackground()" [disabled]="!canSetBg">
          Clear BG
        </button>
        <button
          (click)="onApplyBgFill()"
          [disabled]="!(selectedKind === 'shape' || selectedKind === 'text')"
        >
          Fill = Color
        </button>
        <span class="sep"></span>

        <button
          (click)="emit({ t: 'GROUP', ids: vm.selectedIds })"
          [disabled]="(vm.selectedIds.length || 0) < 2"
        >
          Group
        </button>
        <button (click)="onUngroup()" [disabled]="selectedKind !== 'group'">
          Ungroup
        </button>
        <button
          (click)="emit({ t: 'DUPLICATE' })"
          [disabled]="!vm.selectedIds.length"
        >
          Duplicate
        </button>
        <button
          (click)="emit({ t: 'DELETE' })"
          [disabled]="!vm.selectedIds.length"
        >
          Delete
        </button>
        <span class="sep"></span>

        <button
          (click)="onUndo()"
          [disabled]="!(canUndo$ | async)"
          title="Undo (Ctrl+Z)"
        >
          ↶ Undo
        </button>
        <button
          (click)="onRedo()"
          [disabled]="!(canRedo$ | async)"
          title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
        >
          ↷ Redo
        </button>
        <span class="sep"></span>

        <button
          (click)="onToggleIframeInteractive()"
          [disabled]="!(selectedKind === 'iframe' || selectedKind === 'video')"
          title="Double-click or right-click inside iframe/video to interact"
        >
          🎬 Interact
        </button>
        <span class="sep"></span>

        <label
          >Zoom
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.05"
            [ngModel]="vm.zoom"
            (ngModelChange)="emit({ t: 'ZOOM', z: $event })"
          />
        </label>
        <label>
          <input
            type="checkbox"
            [ngModel]="vm.snapEnabled"
            (ngModelChange)="emit({ t: 'SNAP', on: $event })"
          />
          Grid snap
        </label>
        <label>
          <input
            type="checkbox"
            [ngModel]="vm.guidesEnabled"
            (ngModelChange)="emit({ t: 'GUIDES', on: $event })"
          />
          Guides
        </label>

        <span class="sep"></span>
        <label
          >Aspect Ratio
          <select
            [ngModel]="aspectRatio"
            (ngModelChange)="onAspectRatioChange($event)"
          >
            <option value="none">None</option>
            <option value="16:9">16:9</option>
            <option value="4:3">4:3</option>
          </select>
        </label>

        <span class="sep"></span>
        <label
          >Font
          <select
            [ngModel]="vm.ui.font"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { font: $event } })
            "
          >
            <option>Inter, system-ui, sans-serif</option>
            <option>Arial, Helvetica, sans-serif</option>
            <option>Georgia, serif</option>
            <option>'Times New Roman', Times, serif</option>
            <option>'Segoe UI', Tahoma, Geneva, Verdana, sans-serif</option>
          </select>
        </label>
        <label
          >Weight
          <select
            [ngModel]="vm.ui.weight"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { weight: $event } })
            "
          >
            <option value="400">400</option>
            <option value="500">500</option>
            <option value="600">600</option>
            <option value="700">700</option>
            <option value="800">800</option>
          </select>
        </label>
        <label
          >Color
          <input
            type="color"
            [ngModel]="vm.ui.colorHex"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { colorHex: $event } })
            "
          />
        </label>
        <label>
          Stroke
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            [ngModel]="vm.ui.strokeWidth"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { strokeWidth: +$event } })
            "
          />
        </label>
        <label
          >Align
          <select
            [ngModel]="vm.ui.align"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { align: $event } })
            "
          >
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </label>
        <label
          >Line
          <input
            type="range"
            min="0.2"
            max="1.8"
            step="0.02"
            [ngModel]="vm.ui.lineHeight"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { lineHeight: +$event } })
            "
          />
        </label>
        <label
          >Min
          <input
            type="number"
            min="6"
            max="300"
            step="1"
            [ngModel]="vm.ui.min"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { min: +$event } })
            "
          />
        </label>
        <label
          >Max
          <input
            type="number"
            min="10"
            max="400"
            step="1"
            [ngModel]="vm.ui.max"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { max: +$event } })
            "
          />
        </label>
        <!--        <label>-->
        <!--          <input-->
        <!--            type="checkbox"-->
        <!--            [ngModel]="vm.ui.list"-->
        <!--            (ngModelChange)="-->
        <!--              emit({ t: 'APPLY_STYLE', patch: { list: !!$event } })-->
        <!--            "-->
        <!--          />-->
        <!--          Bulleted-->
        <!--        </label>-->
      </div>
    </ng-container>
    <div
      class="host"
      tabindex="0"
      #host
      (contextmenu)="onContextMenu($event)"
    ></div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        position: relative;
        height: 100%;
        min-height: 560px;
        font: 14px system-ui;
      }
      .host {
        position: absolute;
        top: 170px;
        bottom: 0;
        left: 0;
        right: 0;
      }
      .toolbar {
        color: black;
        position: relative;
        left: 12px;
        top: 8px;
        right: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 6px 10px;
        z-index: 2;
      }
      .sep {
        width: 1px;
        height: 22px;
        background: #e5e7eb;
        display: inline-block;
      }
      button {
        border: 1px solid #cbd5e1;
        background: #fff;
        border-radius: 8px;
        padding: 4px 10px;
        cursor: pointer;
        color: black;
      }
      button.active {
        background: #eef2ff;
        border-color: #a5b4fc;
      }
      label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
    `,
  ],
  providers: [
    { provide: EDITOR_CONFIG, useValue: DEFAULT_CONFIG },
    EditorStore,
    CommandBusService,
    EditorUtilsService,
    TextFitService,
    DragResizeService,
    DialogService,
    OverlayService,
    HistoryService,
    // Multi providers for EDITOR_PLUGINS token
    {
      provide: EDITOR_PLUGINS,
      useClass: TextPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: MediaPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: IframePlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: ShapesPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: BrushPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: GroupingPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useClass: ClipboardPlugin,
      multi: true,
    },
    { provide: HTML_EDITOR_COMPONENT, useValue: HtmlEditorComponent },
  ],
})
export class PixiSlideEditorV2Component implements OnInit, OnDestroy {
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;
  selectedKind?:
    | 'text'
    | 'image'
    | 'video'
    | 'iframe'
    | 'shape'
    | 'group'
    | 'brush';
  brushActive = false;
  canSetBg = false;
  aspectRatio: '16:9' | '4:3' | 'none' = 'none';

  readonly cfg = inject(EDITOR_CONFIG);
  readonly store = inject(EditorStore);
  readonly bus = inject(CommandBusService);
  readonly utils = inject(EditorUtilsService);
  readonly overlay = inject(OverlayService);
  readonly history = inject(HistoryService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  app!: Application;
  world!: Container & { app: Application };
  grid!: TilingSprite;
  guides!: GuideLayer;
  private sceneBounds?: Container;
  private readonly textFit = inject(TextFitService);
  private readonly drag = inject(DragResizeService);
  private readonly dialog = inject(DialogService);

  // Plugin instances provided via DI multi-token
  private plugins = inject(EDITOR_PLUGINS);

  vm$ = this.store.select((state) => state);

  // History observables для кнопок Undo/Redo
  canUndo$ = this.history.canUndo$;
  canRedo$ = this.history.canRedo$;

  private destroy$ = new Subject<void>();
  private ctxMenu?: ContextMenuService;

  ngOnInit() {}
  ngAfterViewInit(): void {
    void this.initPixi();
    // track brush active state for toolbar button highlight
    this.store.brushActive$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isActive) => {
        this.brushActive = isActive;
        this.cdr.markForCheck();
      });
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.app?.destroy(true);
  }

  private async initPixi() {
    const app = new Application();
    await app.init({
      resizeTo: this.hostRef.nativeElement,
      background: this.cfg.background,
      antialias: true,
      resolution: 1,
    });
    this.hostRef.nativeElement.appendChild(app.canvas);

    const world = new Container() as WorldContainer;
    world.app = app;
    app.stage.addChild(world);

    const gridTexture = this.createGridTexture(
      this.cfg.grid.size,
      this.cfg.grid.line,
      this.cfg.grid.alpha
    );
    const grid = new TilingSprite({
      texture: gridTexture,
      width: app.renderer.width,
      height: app.renderer.height,
    });
    world.addChild(grid);

    this.app = app;
    this.world = world;
    this.grid = grid;

    // Guides layer
    this.guides = new GuideLayer(this.world, this.cfg);
    this.world.addChild(this.guides);

    // Overlay host
    this.overlay.setHost(this.hostRef.nativeElement);

    // Stage click to deselect (and commit any open textarea editor)
    this.app.stage.eventMode = 'static';
    this.utils
      .fromPixi<FederatedPointerEvent>(this.app.stage, 'pointerdown')
      .pipe(
        tap((event) => event.preventDefault()),
        filter((event) => {
          /**
           * Нужно для корректного отрабатывания событий возможных вложенных элементов в ноды
           * например html редактор в textNode
           */
          return !(event.target instanceof NodeBase);
          // return event.target === this.app.stage
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.overlay.commitAndCloseTextarea();
        this.bus.emit({ t: 'SELECT', ids: [] });
      });

    // Context menu at cursor (RxJS)
    const host = this.hostRef.nativeElement as HTMLDivElement;
    fromEvent<MouseEvent>(host, 'contextmenu')
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        event.preventDefault();
        // Try to select the node under cursor before opening menu
        const hostRect = host.getBoundingClientRect();
        const pointerX = event.clientX - hostRect.left;
        const pointerY = event.clientY - hostRect.top;
        const nodesUnderCursor: NodeBase[] = [];
        for (let i = 0; i < this.world.children.length; i++) {
          const child = this.world.children[i];
          if (child instanceof NodeBase) {
            const bounds = child.getBounds();
            if (
              pointerX >= bounds.x &&
              pointerX <= bounds.x + bounds.width &&
              pointerY >= bounds.y &&
              pointerY <= bounds.y + bounds.height
            ) {
              nodesUnderCursor.push(child);
            }
          }
        }
        if (nodesUnderCursor.length) {
          // choose the topmost by world z-order (last among matched in children traversal)
          const topmost = nodesUnderCursor[nodesUnderCursor.length - 1];
          const selectedIds = this.store.snapshot((state) => state.selectedIds);
          if (!selectedIds.includes(topmost.id)) {
            this.bus.emit({ t: 'SELECT', ids: [topmost.id] });
          }
        }
        // If an iframe/video is selected and the right-click is inside it, enable interaction instead of opening menu
        const selectedId = this.store.snapshot((state) => state.selectedIds)[0];
        if (selectedId) {
          const nodeRef = this.store.snapshot((state) => state.nodes)[
            selectedId
          ]?.ref as NodeBase;
          if (nodeRef instanceof IframeNode || nodeRef instanceof VideoNode) {
            const bounds = nodeRef.getBounds();
            const margin = 10; // same inset as overlay
            if (
              pointerX >= bounds.x + margin &&
              pointerX <= bounds.x + bounds.width - margin &&
              pointerY >= bounds.y + margin &&
              pointerY <= bounds.y + bounds.height - margin
            ) {
              this.overlay.attachIframe(nodeRef);
              this.overlay.setIframeInteractive(true);
              return; // do not open context menu
            }
          }
        }
        this.ctxMenu?.open(event.clientX, event.clientY);
      });

    // Hotkeys: Delete to remove, Esc to deselect, Undo/Redo (when not typing in inputs)
    fromEvent<KeyboardEvent>(window, 'keydown')
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        const tagName = (event.target as HTMLElement | null)?.tagName;
        const isEditable = (event.target as HTMLElement | null)
          ?.isContentEditable;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || isEditable) return;

        // Undo: Ctrl/Cmd + Z
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key === 'z' &&
          !event.shiftKey
        ) {
          event.preventDefault();
          this.history.undo();
          return;
        }

        // Redo: Ctrl/Cmd + Shift + Z или Ctrl/Cmd + Y
        if (
          (event.ctrlKey || event.metaKey) &&
          ((event.key === 'z' && event.shiftKey) || event.key === 'y')
        ) {
          event.preventDefault();
          this.history.redo();
          return;
        }

        // Select all: Ctrl/Cmd + A using layout-agnostic code
        if ((event.ctrlKey || event.metaKey) && event.code === 'KeyA') {
          event.preventDefault();
          const topLevelIds = this.world.children
            .filter((child): child is NodeBase => child instanceof NodeBase)
            .map((child) => child.id);
          this.bus.emit({ t: 'SELECT', ids: topLevelIds });
          return;
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          this.bus.emit({ t: 'DELETE' });
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          this.bus.emit({ t: 'SELECT', ids: [] });
        }
      });

    // Keep grid size on resize
    fromEvent(window, 'resize')
      .pipe(auditTime(0), takeUntil(this.destroy$))
      .subscribe(() => {
        this.grid.width = this.app.renderer.width;
        this.grid.height = this.app.renderer.height;
      });

    // Global command handlers
    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'SELECT'),
        takeUntil(this.destroy$)
      )
      .subscribe((cmd) => {
        const selectCommand = cmd as Extract<EditorCommand, { t: 'SELECT' }>;
        this.store.setSelection(selectCommand.ids);

        // Toggle selection visuals on all nodes
        const allNodes = this.store.snapshot((state) => state.nodes);
        const selectedSet = new Set(selectCommand.ids || []);
        for (const nodeId of Object.keys(allNodes)) {
          const nodeRef = allNodes[nodeId]?.ref;
          if (nodeRef) {
            nodeRef.setSelected(selectedSet.has(nodeId));
          }
        }

        // Clear guides if nothing is selected
        if (!selectCommand.ids || selectCommand.ids.length === 0) {
          this.guides.draw([]);
        }

        // Update UI toolbar to reflect selected node(s)
        const updateUIFromSelection = () => {
          const selectedIds = selectCommand.ids || [];
          // update selectedKind for toolbar highlighting
          this.selectedKind = undefined;
          if (!selectedIds.length) return;
          const firstId = selectedIds[0];
          const nodeRef = this.store.snapshot((state) => state.nodes)[firstId]
            ?.ref as NodeBase | undefined;
          if (nodeRef instanceof TextNode) this.selectedKind = 'text';
          else if (nodeRef instanceof ImageNode) this.selectedKind = 'image';
          else if (nodeRef instanceof VideoNode) this.selectedKind = 'video';
          else if (nodeRef instanceof IframeNode) this.selectedKind = 'iframe';
          else if (nodeRef instanceof ShapeNode) this.selectedKind = 'shape';
          else if (nodeRef instanceof GroupNode) this.selectedKind = 'group';
          else if (nodeRef instanceof BrushNode) this.selectedKind = 'brush';
          // enable/disable background buttons
          this.canSetBg = !!(
            nodeRef &&
            ((nodeRef instanceof ShapeNode &&
              (nodeRef as ShapeNode).shape !== 'line') ||
              nodeRef instanceof TextNode)
          );
          const pickTextFrom = (node?: NodeBase): TextNode | undefined => {
            if (!node) return undefined;
            if (node instanceof TextNode) return node;
            if (node instanceof GroupNode) {
              for (const child of node.children) {
                if (child instanceof TextNode) return child;
                if (child instanceof GroupNode) {
                  const found = pickTextFrom(child);
                  if (found) return found;
                }
              }
            }
            return undefined;
          };
          const textNode = pickTextFrom(nodeRef);
          if (textNode) {
            this.store.setUI({
              font: textNode.style.font,
              weight: textNode.style.weight,
              color: textNode.style.color,
              colorHex: textNode.style.colorHex,
              align: textNode.style.align,
              lineHeight: textNode.style.lineHeight,
              min: textNode.style.min,
              max: textNode.style.max,
              // list: textNode.style.list,
            });
          } else if (nodeRef instanceof BrushNode) {
            this.store.setUI({
              color: (nodeRef as BrushNode).stroke,
              colorHex: this.utils.numberToHex((nodeRef as BrushNode).stroke),
              strokeWidth: (nodeRef as BrushNode).strokeWidth,
            });
          } else if (nodeRef instanceof ShapeNode) {
            const shapeNode = nodeRef as ShapeNode;
            const strokeWidth =
              shapeNode.shape === 'line'
                ? 1
                : this.store.snapshot((state) => state.ui).strokeWidth || 4;
            this.store.setUI({
              color: shapeNode.stroke,
              colorHex: this.utils.numberToHex(shapeNode.stroke),
              strokeWidth: strokeWidth,
            });
          }
        };
        updateUIFromSelection();

        // For iframe/video nodes: attach but keep non-interactive for drag/resize
        // Double-click or right-click inside will enable interaction
        const selectedId =
          selectCommand.ids?.length === 1 ? selectCommand.ids[0] : undefined;
        if (selectedId) {
          const nodeRef = this.store.snapshot((state) => state.nodes)[
            selectedId
          ]?.ref as NodeBase;
          if (nodeRef instanceof IframeNode || nodeRef instanceof VideoNode) {
            this.overlay.attachIframe(nodeRef);
            // Оставляем неинтерактивным для перемещения/изменения размера
            // Двойной клик или правый клик внутри области активирует интерактивность
            this.overlay.setIframeInteractive(false);
          } else {
            // If selecting something else, keep existing iframe overlay visible (no detach), but ensure it is non-interactive
            this.overlay.setIframeInteractive(false);
          }
        } else {
          // Deselect: keep iframe content visible; ensure it's non-interactive
          this.overlay.setIframeInteractive(false);
        }
        this.cdr.detectChanges();
      });

    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'ZOOM'),
        takeUntil(this.destroy$)
      )
      .subscribe((cmd) => {
        const zoomCommand = cmd as Extract<EditorCommand, { t: 'ZOOM' }>;
        this.store.setZoom(zoomCommand.z);
        this.world.scale.set(zoomCommand.z);
        this.guides.draw([]);
        this.updateSceneBounds(); // Обновляем границы при изменении zoom
        const selectedId = this.store.snapshot((state) => state.selectedIds)[0];
        if (selectedId) {
          const nodeRef = this.store.snapshot((state) => state.nodes)[
            selectedId
          ]?.ref as NodeBase;
          if (nodeRef) this.overlay.syncToNode(nodeRef);
        }
      });

    this.bus.commands$
      .pipe(
        filter(
          (command): command is Extract<EditorCommand, { t: 'SNAP' }> =>
            command.t === 'SNAP'
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((cmd) => this.store.setSnap(cmd.on));
    this.bus.commands$
      .pipe(
        filter(
          (command): command is Extract<EditorCommand, { t: 'GUIDES' }> =>
            command.t === 'GUIDES'
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((cmd) => {
        const isEnabled = cmd.on;
        this.store.setGuides(isEnabled);
        this.guides.enabled = isEnabled;
        this.guides.draw([]);
      });

    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'DELETE'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        const selectedIds = this.store.snapshot((state) => state.selectedIds);
        const allNodes = this.store.snapshot((state) => state.nodes);

        // Создаём батч-команду для удаления всех выделенных узлов
        const removeCommands: RemoveNodeCommand[] = [];

        for (const nodeId of selectedIds) {
          const nodeState = allNodes[nodeId];
          if (nodeState) {
            const worldIndex = this.world.children.indexOf(nodeState.ref);
            const command = new RemoveNodeCommand(
              nodeState,
              this.world,
              this.store,
              worldIndex
            );
            removeCommands.push(command);
          }
        }

        if (removeCommands.length > 0) {
          // Выполняем батч-команду через историю
          const batchCommand = new BatchCommand(
            removeCommands,
            `Удалить узлы (${removeCommands.length})`
          );
          this.history.execute(batchCommand);

          // Очищаем iframe overlay если был удалён iframe
          if (
            selectedIds.some((id) => allNodes[id]?.ref instanceof IframeNode)
          ) {
            this.overlay.detachIframe();
          }

          // Очищаем выделение
          this.bus.emit({ t: 'SELECT', ids: [] });
        }
      });

    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'DUPLICATE'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        const selectedIds = this.store.snapshot((state) => state.selectedIds);
        const allNodes = this.store.snapshot((state) => state.nodes);
        const addedNodes: NodeState[] = [];

        for (const nodeId of selectedIds) {
          const nodeState = allNodes[nodeId];
          if (!nodeState) continue;
          const originalNode = nodeState.ref as NodeBase;
          const clonedNode = this.cloneNode(originalNode);
          if (!clonedNode) continue;
          clonedNode.x = originalNode.x + 24;
          clonedNode.y = originalNode.y + 24;

          // Создаём состояние для нового узла
          const newNodeState: NodeState = {
            id: clonedNode.id,
            type: this.getNodeType(clonedNode),
            ref: clonedNode,
          };

          // Привязываем drag-resize
          this.drag.bind(clonedNode, new Subject<void>(), {
            cfg: this.cfg,
            store: this.store,
            guides: this.guides,
            world: this.world,
            app: this.app,
            bus: this.bus,
            utils: this.utils,
            overlay: this.overlay,
            history: this.history,
          });

          addedNodes.push(newNodeState);
        }

        if (addedNodes.length > 0) {
          // Выполняем команду дублирования через историю
          const command = new DuplicateNodesCommand(
            addedNodes,
            this.world,
            this.store,
            this.bus
          );
          this.history.execute(command);
        }
      });

    // Z-index commands: reorder selected nodes among top-level NodeBase children
    const reorder = (mode: 'front' | 'back' | 'forward' | 'backward') => {
      const selectedIds =
        this.store.snapshot((state) => state.selectedIds) || [];
      if (!selectedIds.length) return;
      const worldChildren = this.world.children;
      const nodeChildren = worldChildren.filter(
        (child): child is NodeBase => child instanceof NodeBase
      );
      if (!nodeChildren.length) return;
      const getIndexInWorld = (node: NodeBase) => worldChildren.indexOf(node);
      const firstWorldIndex = getIndexInWorld(nodeChildren[0]);
      const lastWorldIndex = getIndexInWorld(
        nodeChildren[nodeChildren.length - 1]
      );

      const selectedSet = new Set(selectedIds);
      const selectedNodes = nodeChildren.filter((node) =>
        selectedSet.has(node.id)
      );
      if (!selectedNodes.length) return;

      const moveToWorldIndex = (node: NodeBase, worldIndex: number) => {
        const clampedIndex = Math.max(
          0,
          Math.min(worldChildren.length - 1, worldIndex)
        );
        if (worldChildren.indexOf(node) !== clampedIndex)
          this.world.setChildIndex(node, clampedIndex);
      };

      if (mode === 'front') {
        // Keep relative order: process top-to-bottom order
        let currentIndex = lastWorldIndex;
        for (const node of selectedNodes) {
          moveToWorldIndex(node, currentIndex);
          currentIndex++;
        }
      } else if (mode === 'back') {
        let currentIndex = firstWorldIndex;
        for (const node of selectedNodes) {
          moveToWorldIndex(node, currentIndex);
          currentIndex++;
        }
      } else if (mode === 'forward' || mode === 'backward') {
        const step = mode === 'forward' ? +1 : -1;
        // For stable move, sort by current world index accordingly
        const sortedNodes = [...selectedNodes].sort(
          (nodeA, nodeB) => getIndexInWorld(nodeA) - getIndexInWorld(nodeB)
        );
        const orderedList = step > 0 ? sortedNodes.reverse() : sortedNodes; // moving forward: start from topmost
        for (const node of orderedList) {
          const currentIndex = getIndexInWorld(node);
          const targetIndex = currentIndex + step;
          // Only swap if the neighbor is a NodeBase; otherwise skip
          const neighbor = worldChildren[targetIndex];
          if (neighbor instanceof NodeBase) moveToWorldIndex(node, targetIndex);
        }
      }
    };

    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'BRING_TO_FRONT'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => reorder('front'));
    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'SEND_TO_BACK'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => reorder('back'));
    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'BRING_FORWARD'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => reorder('forward'));
    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'SEND_BACKWARD'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => reorder('backward'));

    // Enable iframe/video interactive mode
    this.bus.commands$
      .pipe(
        filter((command) => command.t === 'ENABLE_IFRAME_INTERACTIVE'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        const selectedId = this.store.snapshot((state) => state.selectedIds)[0];
        if (!selectedId) return;
        const nodeRef = this.store.snapshot((state) => state.nodes)[selectedId]
          ?.ref as NodeBase;
        if (nodeRef instanceof IframeNode || nodeRef instanceof VideoNode) {
          this.overlay.attachIframe(nodeRef);
          this.overlay.setIframeInteractive(true);
        }
      });

    // Initialize plugins
    const ctx: EditorContext = {
      app: this.app,
      world: this.world,
      store: this.store,
      bus: this.bus,
      utils: this.utils,
      overlay: this.overlay,
      guides: this.guides,
      cfg: this.cfg,
      history: this.history,
    };
    this.plugins.forEach((plugin) => plugin.init(ctx));

    // Demo nodes (optional)
    this.bus.emit({
      t: 'ADD_TEXT',
      x: 120,
      y: 100,
      text: 'Благодать твоя, как река, Наполняет сердце моё…',
    });
    this.bus.emit({
      t: 'ADD_TEXT',
      x: 180,
      y: 380,
      text: 'В Твоих я покоюсь руках.',
    });

    // Context menu
    this.ctxMenu = new ContextMenuService(
      this.hostRef.nativeElement,
      this.bus,
      this.store
    );
  }

  private createGridTexture(size = 20, line = 1, alpha = 0.08) {
    const cvs = document.createElement('canvas');
    cvs.width = size;
    cvs.height = size;
    const ctx = cvs.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(size - line, 0, line, size);
    ctx.fillRect(0, size - line, size, line);
    return Texture.from(cvs);
  }

  private getNodeType(
    n: NodeBase
  ): 'text' | 'image' | 'video' | 'iframe' | 'shape' | 'group' | 'brush' {
    if (n instanceof TextNode) return 'text';
    if (n instanceof ImageNode) return 'image';
    if (n instanceof VideoNode) return 'video';
    if (n instanceof IframeNode) return 'iframe';
    if (n instanceof ShapeNode) return 'shape';
    if (n instanceof GroupNode) return 'group';
    if (n instanceof BrushNode) return 'brush';
    // Fallback: create an explicit type if new node classes appear
    // Unknown node type; defaulting to 'group' to keep it visible
    return 'group';
  }

  private cloneNode(src: NodeBase): NodeBase | null {
    if (src instanceof TextNode) {
      const n = new TextNode(this.app, this.textFit);
      n.textHtml = src.textHtml;
      n.style = { ...src.style };
      n.applyBoxSize(src.w, src.h);
      n.requestFit();
      return n;
    }
    if (src instanceof ImageNode) {
      const n = new ImageNode();
      n.applyBoxSize(src.w, src.h);
      n.sprite.texture = (src as ImageNode).sprite.texture;
      n.sprite.anchor.set(0.5);
      n.sprite.position.set(n.w / 2, n.h / 2);
      n.sprite.scale.set((src as ImageNode).sprite.scale.x);
      return n;
    }
    if (src instanceof VideoNode) {
      const n = new VideoNode();
      n.applyBoxSize(src.w, src.h);
      n.sprite.texture = (src as VideoNode).sprite.texture;
      n.sprite.anchor.set(0.5);
      n.sprite.position.set(n.w / 2, n.h / 2);
      n.sprite.scale.set((src as VideoNode).sprite.scale.x);
      return n;
    }
    if (src instanceof IframeNode) {
      const n = new IframeNode(src.url);
      n.applyBoxSize(src.w, src.h);
      return n;
    }
    if (src instanceof GroupNode) {
      // Deep-clone group with its children (as a new independent block)
      const childClones: NodeBase[] = [];
      const g = new GroupNode();
      g.applyBoxSize(src.w, src.h);
      // Clone each child, keep relative position
      for (const ch of src.children) {
        if (!(ch instanceof NodeBase)) continue;
        const c = this.cloneNode(ch);
        if (!c) continue;
        c.x = ch.x;
        c.y = ch.y;
        c.eventMode = 'none';
        g.addChild(c);
        childClones.push(c);
      }
      return g;
    }
    if (src instanceof ShapeNode) {
      const n = new ShapeNode(src.shape);
      n.fill = src.fill;
      n.stroke = src.stroke;
      n.lineWidth = src.lineWidth;
      n.applyBoxSize(src.w, src.h);
      return n;
    }
    if (src instanceof BrushNode) {
      const n = new BrushNode();
      n.stroke = src.stroke;
      n.strokeWidth = src.strokeWidth;
      n.applyBoxSize(src.w, src.h);
      // copy path from internal BrushNode state; TypeScript doesn't expose it, so we use a typed view
      type HasPath = { path?: Point[] };
      const raw = src as unknown as HasPath; // specific structural type cast instead of any
      const pts: Point[] = (raw.path ?? []).map(
        (p: Point) => new Point(p.x, p.y)
      );
      n.setPath(pts);
      return n;
    }
    return null;
  }

  emit(cmd: EditorCommand) {
    this.bus.emit(cmd);
  }

  /**
   * Отменяет последнее действие в истории.
   */
  onUndo() {
    this.history.undo();
  }

  /**
   * Повторяет отменённое действие.
   */
  onRedo() {
    this.history.redo();
  }

  async onImageUrl() {
    const url = await this.dialog.askUrl('Image URL');
    if (url) this.emit({ t: 'ADD_IMAGE', url });
  }
  async onVideoUrl() {
    const url = await this.dialog.askUrl('Video URL');
    if (url) this.emit({ t: 'ADD_VIDEO', url });
  }
  async onIframeUrl() {
    const url = await this.dialog.askUrl('URL to embed');
    if (url) this.emit({ t: 'ADD_IFRAME', url });
  }
  onUngroup() {
    const id = this.store.snapshot((s) => s.selectedIds)[0];
    if (id) this.emit({ t: 'UNGROUP', id });
  }

  async onSetBackground() {
    const id = this.store.snapshot((s) => s.selectedIds)[0];
    if (!id) return;
    const url = await this.dialog.askUrl('Background image URL / data:');
    if (url) this.emit({ t: 'SET_TEXT_BACKGROUND', url });
  }

  onClearBackground() {
    this.emit({ t: 'CLEAR_TEXT_BACKGROUND' });
  }
  onApplyBgFill() {
    const color = this.store.snapshot((s) => s.ui).color || 0x000000;
    this.emit({ t: 'SET_TEXT_BG_COLOR', color });
  }

  async onSetShapeBackground() {
    const id = this.store.snapshot((s) => s.selectedIds)[0];
    if (!id) return;
    const url = await this.dialog.askUrl('Background image URL / data:');
    if (url) this.emit({ t: 'SET_SHAPE_BACKGROUND', url });
  }
  onApplyShapeFill() {
    const color = this.store.snapshot((s) => s.ui).color || 0x000000;
    this.emit({ t: 'SET_SHAPE_FILL', color });
  }

  onAspectRatioChange(ratio: '16:9' | '4:3' | 'none') {
    this.aspectRatio = ratio;
    this.updateSceneBounds();
  }

  onToggleIframeInteractive() {
    const selectedId = this.store.snapshot((s) => s.selectedIds)[0];
    if (!selectedId) return;

    const ref = this.store.snapshot((s) => s.nodes)[selectedId]
      ?.ref as NodeBase;
    if (ref instanceof IframeNode || ref instanceof VideoNode) {
      this.overlay.attachIframe(ref);
      this.overlay.setIframeInteractive(true);
    }
  }

  private updateSceneBounds() {
    // Удаляем старые границы если есть
    if (this.sceneBounds) {
      this.world.removeChild(this.sceneBounds);
      this.sceneBounds.destroy();
      this.sceneBounds = undefined;
    }

    if (this.aspectRatio === 'none') return;

    // Создаём контейнер для границ
    const bounds = new Container();
    const g = new Graphics();

    // Определяем размеры сцены на основе соотношения сторон
    const canvasWidth = this.app.renderer.width;
    const canvasHeight = this.app.renderer.height;

    // Учитываем текущий zoom и позицию world
    const zoom = this.store.snapshot((s) => s.zoom);

    let sceneWidth: number;
    let sceneHeight: number;

    if (this.aspectRatio === '16:9') {
      // Вычисляем размеры для 16:9
      const ratio = 16 / 9;
      if (canvasWidth / canvasHeight > ratio) {
        // Ограничены по высоте
        sceneHeight = (canvasHeight * 0.9) / zoom; // 90% высоты canvas с учетом zoom
        sceneWidth = sceneHeight * ratio;
      } else {
        // Ограничены по ширине
        sceneWidth = (canvasWidth * 0.9) / zoom; // 90% ширины canvas с учетом zoom
        sceneHeight = sceneWidth / ratio;
      }
    } else {
      // 4:3
      const ratio = 4 / 3;
      if (canvasWidth / canvasHeight > ratio) {
        sceneHeight = (canvasHeight * 0.9) / zoom;
        sceneWidth = sceneHeight * ratio;
      } else {
        sceneWidth = (canvasWidth * 0.9) / zoom;
        sceneHeight = sceneWidth / ratio;
      }
    }

    // Центрируем сцену относительно видимой области world
    const x = (canvasWidth / zoom - sceneWidth) / 2;
    const y = (canvasHeight / zoom - sceneHeight) / 2;

    // Рисуем границы (пунктирная линия)
    g.setStrokeStyle({ width: 2 / zoom, color: 0xff6b6b, alpha: 0.8 });

    // Рисуем прямоугольник границ
    const dashLength = 10 / zoom;
    const gapLength = 5 / zoom;

    // Верхняя линия
    for (let i = 0; i < sceneWidth; i += dashLength + gapLength) {
      const len = Math.min(dashLength, sceneWidth - i);
      g.moveTo(x + i, y);
      g.lineTo(x + i + len, y);
    }

    // Правая линия
    for (let i = 0; i < sceneHeight; i += dashLength + gapLength) {
      const len = Math.min(dashLength, sceneHeight - i);
      g.moveTo(x + sceneWidth, y + i);
      g.lineTo(x + sceneWidth, y + i + len);
    }

    // Нижняя линия
    for (let i = 0; i < sceneWidth; i += dashLength + gapLength) {
      const len = Math.min(dashLength, sceneWidth - i);
      g.moveTo(x + sceneWidth - i, y + sceneHeight);
      g.lineTo(x + sceneWidth - i - len, y + sceneHeight);
    }

    // Левая линия
    for (let i = 0; i < sceneHeight; i += dashLength + gapLength) {
      const len = Math.min(dashLength, sceneHeight - i);
      g.moveTo(x, y + sceneHeight - i);
      g.lineTo(x, y + sceneHeight - i - len);
    }

    g.stroke();

    bounds.addChild(g);

    this.sceneBounds = bounds;
    // Добавляем границы поверх всего, но под handles
    this.world.addChild(bounds);
  }

  onContextMenu(e: MouseEvent) {
    e.preventDefault();
    this.ctxMenu?.open(e.clientX, e.clientY);
  }
}

@Component({
  selector: 'lyri-test-pixi-editor-v2',
  standalone: true,
  imports: [CommonModule, PixiSlideEditorV2Component],
  template: `<lyri-pixi-slide-editor-v2 />`,
})
export class TestPixiEditorV2Component {}
