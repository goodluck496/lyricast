import { EditorSerializerService } from './services/editor-serializer.service';

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  EventEmitter,
  ViewChild,
} from '@angular/core';
import { AsyncPipe, DecimalPipe, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SliderModule } from 'primeng/slider';
import { ColorPickerModule } from 'primeng/colorpicker';
import { DividerModule } from 'primeng/divider';
import { PanelModule } from 'primeng/panel';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSliderModule } from '@angular/material/slider';
import { NG_SCROLLBAR_OPTIONS, NgScrollbarModule } from 'ngx-scrollbar';
import {
  Application,
  Container,
  FederatedPointerEvent,
  Rectangle,
  TilingSprite,
} from 'pixi.js';
import { EDITOR_CONFIG } from './types';
import { EDITOR_PLUGINS, EditorContext } from './core';
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
import { UiTextStyles } from './types';
import {
  BatchCommand,
  DuplicateNodesCommand,
  RemoveNodeCommand,
} from './services/history-commands';
import { GuideLayer } from './guides';
import { fromEvent, Subject } from 'rxjs';
import { ContextMenuService } from './services/context-menu.service';
import { AssetStorageService } from './services/asset-storage.service';
import { auditTime, filter, takeUntil, tap } from 'rxjs/operators';
import {
  BrushNode,
  GroupNode,
  IframeNode,
  ImageNode,
  NodeBase,
  ShapeNode,
  TextNode,
  VideoNode,
} from './nodes';
import { PIXI_EDITOR_PROVIDERS } from './pixi-editor.providers';
import { NodeFactoryService } from './services/node-factory.service';
import { SceneViewportService } from './services/scene-viewport.service';
import { NgScrollbarExt } from 'ngx-scrollbar';
import { DialogModule } from 'primeng/dialog';
import { AssetPickerComponent } from '@lyri-cast/asset-management';
import { AssetDto } from '@lyri-cast/entities';



type WorldContainer = Container & { app: Application };

@Component({
  selector: 'lyri-pixi-slide-editor-v2',
  standalone: true,
  imports: [
    FormsModule,
    AsyncPipe,
    DecimalPipe,
    ButtonModule,
    FloatLabelModule,
    InputNumberModule,
    SelectModule,
    ToggleSwitchModule,
    SliderModule,
    ColorPickerModule,
    DividerModule,
    PanelModule,
    NgScrollbarModule,
    MatSidenavModule,
    MatSliderModule,
    DialogModule,
    AssetPickerComponent,
  ],
  templateUrl: 'pixi-editor.component.html',
  styleUrl: 'pixi-editor.component.scss',
  providers: [
    ...PIXI_EDITOR_PROVIDERS(),
    {
      provide: NG_SCROLLBAR_OPTIONS,
      useValue: {
        dragScroll: false,
        wheelPropagation: false,
        touchmovePropagation: false,
      },
    },
  ],
})
export class PixiSlideEditorV2Component
  implements OnInit, AfterViewInit, OnDestroy
{
  @HostBinding('class.color-picker-open')
  protected get isColorPickerOpenClass(): boolean {
    return this.colorPickerOpen;
  }

  @ViewChild('host', { static: false }) hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('propertiesScrollbar', { static: false })
  private propertiesScrollbarRef?: NgScrollbarExt;
  @ViewChild('assetPicker', { static: false })
  private assetPicker?: AssetPickerComponent;

  @Output() applyTextStylesToAll = new EventEmitter<{ styles: UiTextStyles, event: Event }>();

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
  propertiesOpen = true;
  aspectRatio: '16:9' | '4:3' | 'none' = '16:9';

  assetPickerVisible = false;
  assetPickerMode: 'image' | 'background' | 'shape-background' = 'image';

  readonly cfg = inject(EDITOR_CONFIG);
  readonly store = inject(EditorStore);
  readonly bus = inject(CommandBusService);
  readonly utils = inject(EditorUtilsService);
  readonly overlay = inject(OverlayService);
  readonly history = inject(HistoryService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly document = inject(DOCUMENT);
  public readonly serializer = inject(EditorSerializerService);
  private readonly nodeFactory = inject(NodeFactoryService);
  public readonly sceneViewport = inject(SceneViewportService);

  app!: Application;
  world!: Container & { app: Application };
  grid!: TilingSprite;
  guides!: GuideLayer;

  private readonly textFit = inject(TextFitService);
  private readonly drag = inject(DragResizeService);
  private readonly dialog = inject(DialogService);
  private readonly assetStorage = inject(AssetStorageService);
  private readonly overlayService = inject(OverlayService);

  // Plugin instances provided via DI multi-token
  private plugins = inject(EDITOR_PLUGINS);

  vm$ = this.store.select((state) => state);

  // History observables для кнопок Undo/Redo
  canUndo$ = this.history.canUndo$;
  canRedo$ = this.history.canRedo$;

  private destroy$ = new Subject<void>();
  private hideTextPanelTimer?: number;
  textPanelVisible = false;
  private textPanelDelayMs = 60;
  fontMin = 16;
  fontMax = 150;
  private colorPickerOpen = false;
  readonly fontSizeStep = 4;

  private removeScrollbarLock?: () => void;
  private removeColorPickerKeyGuard?: () => void;

  aspectOptions: { label: string; value: '16:9' | '4:3' | 'none' }[] = [
    { label: '16:9', value: '16:9' },
    { label: '4:3', value: '4:3' },
    { label: 'Нет', value: 'none' },
  ];
  fontOptions = [
    { label: 'Sans Serif', value: 'sans-serif' },
    { label: 'Font-1', value: 'Font-1' },
    { label: 'Font-2', value: 'Font-2' },
    { label: 'Font-3', value: 'Font-3' },
    { label: 'Font-4', value: 'Font-4' },
    { label: 'Font-5', value: 'Font-5' },
    { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
    { label: 'Segoe UI', value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
  ];
  weightOptions = [
    { label: '400', value: '400' },
    { label: '500', value: '500' },
    { label: '600', value: '600' },
    { label: '700', value: '700' },
    { label: '800', value: '800' },
  ];
  alignOptions = [
    { label: 'Слева', value: 'left' },
    { label: 'По центру', value: 'center' },
    { label: 'Справа', value: 'right' },
  ];
  /**
   * Generic "content changed" stream for external consumers (e.g., free-slide preview/live-sync).
   * Emits on commands that mutate visual slide content but may not go through HistoryService.
   */
  change$ = new Subject<void>();
  private ctxMenu?: ContextMenuService;

  ngOnInit() {
    // Initialize serializer with component's PixiJS context
    this.serializer.app = this.app;
    this.serializer.sceneWidth = this.sceneViewport.sceneWidth;
    this.serializer.sceneHeight = this.sceneViewport.sceneHeight;
    this.serializer.baseSceneWidth = this.sceneViewport.baseSceneWidth;
    this.serializer.baseSceneHeight = this.sceneViewport.baseSceneHeight;
    this.serializer.aspectRatio = this.sceneViewport.aspectRatio;

    // Initialize node factory with component's PixiJS context
    this.nodeFactory.app = this.app;

    // Initialize scene viewport service with component's PixiJS context
    this.sceneViewport.app = this.app;
    this.sceneViewport.world = this.world;
    this.sceneViewport.aspectRatio = this.aspectRatio;
  }

  async ngAfterViewInit(): Promise<void> {
    await this.initPixi();
    this.syncFontOptionsFromDocumentFonts();
    void this.document.fonts?.ready.then(() => {
      this.syncFontOptionsFromDocumentFonts();
    });

    // Инициализируем границы сцены при запуске
    this.sceneViewport.updateSceneBounds();

    // Update serializer with new scene dimensions
    this.serializer.baseSceneWidth = this.sceneViewport.baseSceneWidth;
    this.serializer.baseSceneHeight = this.sceneViewport.baseSceneHeight;
    this.serializer.aspectRatio = this.sceneViewport.aspectRatio;

    // track brush active state for toolbar button highlight
    this.store.brushActive$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isActive) => {
        this.brushActive = isActive;
        this.cdr.markForCheck();
      });
  }

  applyPixiParams() {
    this.serializer.app = this.app;
    this.serializer.world = this.world;
    this.serializer.sceneWidth = this.sceneViewport.sceneWidth;
    this.serializer.sceneHeight = this.sceneViewport.sceneHeight;
    this.serializer.baseSceneWidth = this.sceneViewport.baseSceneWidth;
    this.serializer.baseSceneHeight = this.sceneViewport.baseSceneHeight;
    this.serializer.aspectRatio = this.sceneViewport.aspectRatio;
    this.serializer.guides = this.guides;
    this.serializer.cfg = this.cfg;
    // Initialize node factory with component's PixiJS context
    this.nodeFactory.app = this.app;

    // Initialize scene viewport service with component's PixiJS context
    this.sceneViewport.app = this.app;
    this.sceneViewport.world = this.world;
    this.sceneViewport.aspectRatio = this.aspectRatio;
  }

  ngOnDestroy(): void {
    if (this.hideTextPanelTimer) {
      clearTimeout(this.hideTextPanelTimer);
    }
    this.removeScrollbarLock?.();
    this.removeColorPickerKeyGuard?.();
    this.destroy$.next();
    this.destroy$.complete();
    this.ctxMenu?.close();
    this.overlay.teardownEditor();
    this.overlay.detachIframe();
    this.plugins.forEach((plugin) => plugin.dispose?.());
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

    const gridTexture = this.sceneViewport.createGridTexture(
      this.cfg.grid.size,
      this.cfg.grid.line,
      this.cfg.grid.alpha
    );
    const grid = new TilingSprite({
      texture: gridTexture,
      width: app.renderer.width,
      height: app.renderer.height,
    });
    // Добавляем сетку на самый задний план сцены, чтобы она не зависела от смещения world
    app.stage.addChildAt(grid, 0);

    this.app = app;
    this.world = world;
    this.grid = grid;

    // Guides layer
    this.guides = new GuideLayer(this.world, this.cfg, this.sceneViewport);
    this.world.addChild(this.guides);

    // Overlay host
    this.overlay.setHost(this.hostRef.nativeElement);

    // Stage click to deselect (and commit any open textarea editor)
    this.app.stage.eventMode = 'static';

    this.applyPixiParams();

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

    // Keep grid size and scene bounds on renderer resize
    this.utils
      .fromPixi(this.app.stage, 'resize')
      .pipe(auditTime(16), takeUntil(this.destroy$)) // auditTime to prevent excessive calls
      .subscribe(() => {
        if (!this.app || this.app.stage.destroyed) return;
        this.grid.width = this.app.renderer.width;
        this.grid.height = this.app.renderer.height;
        this.sceneViewport.resetCanonicalDimensions(); // <-- СБРОС КЭША
        this.sceneViewport.updateSceneBounds();
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
          this.canSetBg = false;
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
          this.canSetBg =
            this.getSelectedBackgroundMode(selectedIds) !== undefined;
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
            const safeMin = this.clampFontSize(textNode.style.min);
            const safeMax = this.clampFontSize(textNode.style.max);
            this.store.setUI({
              font: textNode.style.font,
              weight: textNode.style.weight,
              color: textNode.style.color,
              colorHex: textNode.style.colorHex,
              shadowColor: textNode.style.shadowColor ?? 0x000000,
              shadowColorHex: textNode.style.shadowColorHex ?? '#000000',
              shadowSize: textNode.style.shadowSize ?? 0,
              shadowBlur: textNode.style.shadowBlur ?? 0,
              actualFontSize: textNode.currentFontSize,
              align: textNode.style.align,
              lineHeight: textNode.style.lineHeight,
              min: safeMin,
              max: safeMax,
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
            const uiStroke = this.store.snapshot((state) => state.ui).strokeWidth;
            const nodeStroke =
              'strokeWidth' in shapeNode ? (shapeNode as ShapeNode & { strokeWidth?: number }).strokeWidth : undefined;
            // для линий используем последнее введённое значение из UI (или текущее у ноды), не сбрасываем на 1
            const strokeWidth =
              uiStroke ?? nodeStroke ?? (shapeNode.shape === 'line' ? 1 : 4);
            this.store.setUI({
              color: shapeNode.stroke,
              colorHex: this.utils.numberToHex(shapeNode.stroke),
              strokeWidth: strokeWidth,
            });
          }
        };
        updateUIFromSelection();
        this.scheduleTextPanelVisibility(this.selectedKind);

        // For iframe/video nodes: attach but keep non-interactive for drag/resize
        // Double-click or right-click inside will enable interaction
        const selectedId =
          selectCommand.ids?.length === 1 ? selectCommand.ids[0] : undefined;
        if (selectedId) {
          const nodeRef = this.store.snapshot((state) => state.nodes)[
            selectedId
          ]?.ref as NodeBase;
          if (nodeRef instanceof IframeNode) {
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
        this.sceneViewport.updateSceneBounds(); // Обновляем границы при изменении zoom
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
          const clonedNode = this.nodeFactory.cloneNode(originalNode);
          if (!clonedNode) continue;
          clonedNode.x = originalNode.x + 24;
          clonedNode.y = originalNode.y + 24;

          // Создаём состояние для нового узла
          const newNodeState: NodeState = {
            id: clonedNode.id,
            type: this.nodeFactory.getNodeType(clonedNode),
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
            getSceneBounds: () => this.sceneViewport.getSceneBounds(),
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
      this.change$.next();
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

    // Broadcast content-changing commands (for autosave/live-sync consumers)
    this.bus.commands$
      .pipe(
        filter((command) =>
          [
            'ADD_TEXT',
            'APPLY_STYLE',
            'CLEAR_TEXT_BACKGROUND',
            'SET_TEXT_BG_COLOR',
            'ADD_SHAPE',
            'CLEAR_SHAPE_BACKGROUND',
            'SET_SHAPE_FILL',
            'ADD_BRUSH',
            'CLEAR_BRUSH_BACKGROUND',
          ].includes(command.t)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.change$.next();
      });

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
      nodeFactory: this.nodeFactory, // <-- Добавлено
      getSceneBounds: () => this.sceneViewport.getSceneBounds(),
    };
    this.plugins.forEach((plugin) => plugin.init(ctx));

    // Context menu
    this.ctxMenu = new ContextMenuService(
      this.hostRef.nativeElement,
      this.bus,
      this.store
    );

    // Инициализируем размеры сцены сразу после создания app
    this.sceneViewport.updateSceneBounds();
  }

  emit(cmd: EditorCommand) {
    this.bus.emit(cmd);
  }

  private scheduleTextPanelVisibility(kind?: typeof this.selectedKind) {
    if (this.hideTextPanelTimer) {
      clearTimeout(this.hideTextPanelTimer);
    }
    if (kind === 'text') {
      this.textPanelVisible = true;
      this.cdr.markForCheck();
      return;
    }
    // небольшая задержка: если текст снова выбран после перерисовки, не скрываем панель
    this.hideTextPanelTimer = window.setTimeout(() => {
      const ids = this.store.snapshot((s) => s.selectedIds);
      const nodeMap = this.store.snapshot((s) => s.nodes);
      const firstId = ids[0];
      const nodeRef = firstId ? (nodeMap[firstId]?.ref as NodeBase | undefined) : undefined;
      const nextKind =
        nodeRef instanceof TextNode
          ? 'text'
          : nodeRef instanceof ImageNode
            ? 'image'
            : nodeRef instanceof VideoNode
              ? 'video'
              : nodeRef instanceof IframeNode
                ? 'iframe'
                : nodeRef instanceof ShapeNode
                  ? 'shape'
                  : nodeRef instanceof GroupNode
                    ? 'group'
                    : nodeRef instanceof BrushNode
                      ? 'brush'
                      : undefined;
      this.textPanelVisible = nextKind === 'text';
      this.cdr.markForCheck();
    }, this.textPanelDelayMs);
  }

  /**
   * Triggers layout() for all TextNode instances currently present on the scene.
   * Useful after bulk deserialization to ensure auto-fitting to scene size.
   */
  public async fitAllTextNodes(): Promise<void> {
    const nodes = this.store.snapshot((s) => s.nodes);
    const tasks: Promise<void>[] = [];

    for (const id of Object.keys(nodes)) {
      const ref = nodes[id]?.ref as NodeBase | undefined;
      if (ref instanceof TextNode) {
        try {
          // Wait for multiple frames to ensure proper text measurement
          const waitForFrames = async (count: number) => {
            for (let i = 0; i < count; i++) {
              await new Promise<void>((r) => requestAnimationFrame(() => r()));
            }
          };

          tasks.push(
            (async () => {
              await waitForFrames(2); // Wait for 2 frames to ensure DOM is ready
              await ref.layout();
              await waitForFrames(1); // Wait one more frame for layout to settle
            })()
          );
        } catch (e) {
          console.warn('Failed to fit text node:', e);
        }
      }
    }

    if (tasks.length) {
      await Promise.allSettled(tasks);
      // Final wait to ensure all text measurements are complete
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
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

  onImageUrl() {
    this.openAssetPicker('image');
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

  onSetBackground() {
    const mode = this.getSelectedBackgroundMode();
    if (!mode) return;
    this.openAssetPicker(mode);
  }

  onClearBackground() {
    const mode = this.getSelectedBackgroundMode();
    if (mode === 'background') {
      this.emit({ t: 'CLEAR_TEXT_BACKGROUND' });
    } else if (mode === 'shape-background') {
      this.emit({ t: 'CLEAR_SHAPE_BACKGROUND' });
    }
  }
  onApplyTextBackground(hex: string) {
    if (!hex) return;
    const color = Number.parseInt(hex.replace('#', '0x'), 16);
    this.emit({ t: 'SET_TEXT_BG_COLOR', color });
    this.emit({ t: 'APPLY_STYLE', patch: { bgColorHex: hex, bgColor: color } });
  }

  onSetShapeBackground() {
    const id = this.store.snapshot((s) => s.selectedIds)[0];
    if (!id) return;
    this.openAssetPicker('shape-background');
  }

  private openAssetPicker(
    mode: 'image' | 'background' | 'shape-background'
  ): void {
    this.assetPickerMode = mode;
    this.assetPickerVisible = true;
    this.cdr.markForCheck();
    queueMicrotask(() => this.assetPicker?.loadAssets());
  }

  onAssetPickerDialogShow(): void {
    this.assetPicker?.loadAssets();
  }

  private getSelectedBackgroundMode(
    selectedIds = this.store.snapshot((state) => state.selectedIds)
  ): 'background' | 'shape-background' | undefined {
    if (selectedIds.length === 0) {
      return undefined;
    }

    const nodes = this.store.snapshot((state) => state.nodes);
    const firstMode = this.getBackgroundModeForNode(nodes[selectedIds[0]]?.ref);

    if (!firstMode) {
      return undefined;
    }

    const sameModeForSelection = selectedIds.every(
      (id) => this.getBackgroundModeForNode(nodes[id]?.ref) === firstMode
    );

    return sameModeForSelection ? firstMode : undefined;
  }

  private getBackgroundModeForNode(
    node: NodeBase | undefined
  ): 'background' | 'shape-background' | undefined {
    if (node instanceof TextNode) {
      return 'background';
    }

    if (node instanceof ShapeNode && node.shape !== 'line') {
      return 'shape-background';
    }

    return undefined;
  }
  
  onAssetPicked(event: { asset: AssetDto; url: string }) {
    this.assetPickerVisible = false;
    this.cdr.markForCheck();
    
    if (this.assetPickerMode === 'image') {
      this.emit({ t: 'ADD_IMAGE', url: event.url });
    } else if (this.assetPickerMode === 'background') {
      this.emit({ t: 'SET_TEXT_BACKGROUND', url: event.url });
    } else if (this.assetPickerMode === 'shape-background') {
      this.emit({ t: 'SET_SHAPE_BACKGROUND', url: event.url });
    }
  }
  onApplyShapeFill() {
    const color = this.store.snapshot((s) => s.ui).color || 0x000000;
    this.emit({ t: 'SET_SHAPE_FILL', color });
  }

  onAspectRatioChange(ratio: '16:9' | '4:3' | 'none') {
    this.aspectRatio = ratio;
    this.sceneViewport.aspectRatio = ratio;
    this.sceneViewport.updateSceneBounds();
    // Update serializer with new scene dimensions
    this.serializer.sceneWidth = this.sceneViewport.sceneWidth;
    this.serializer.sceneHeight = this.sceneViewport.sceneHeight;
    this.serializer.baseSceneWidth = this.sceneViewport.baseSceneWidth;
    this.serializer.baseSceneHeight = this.sceneViewport.baseSceneHeight;
    this.serializer.aspectRatio = this.aspectRatio;
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

  formatFontSize = (value: number | null): string => {
    if (value === null || value === undefined) return '';
    return `${Math.round(value)}px`;
  };

  formatPx = (value: number | null): string => {
    if (value === null || value === undefined) return '';
    return `${Math.round(value)}px`;
  };

  getFontOptionFamily(font: string | null | undefined): string {
    const value = font || 'sans-serif';
    return value === 'sans-serif' ? 'sans-serif' : `"${value}", sans-serif`;
  }

  getFontOptionLabel(
    value: string | { label?: string; value?: string } | null | undefined
  ): string {
    if (!value) return '';
    if (typeof value !== 'string') return value.label ?? value.value ?? '';

    return (
      this.fontOptions.find((option) => option.value === value)?.label ?? value
    );
  }

  onFontSizeMinChange(value: number | null) {
    const nextMin = this.clampFontSize(value);
    const currentMax = this.clampFontSize(this.store.snapshot((s) => s.ui).max);
    const patch: Partial<UiTextStyles> = { min: nextMin };
    if (nextMin > currentMax) {
      patch.max = nextMin;
    }
    this.emit({ t: 'APPLY_STYLE', patch });
  }

  onFontSizeMaxChange(value: number | null) {
    const nextMax = this.clampFontSize(value);
    const currentMin = this.clampFontSize(this.store.snapshot((s) => s.ui).min);
    const patch: Partial<UiTextStyles> = { max: nextMax };
    if (nextMax < currentMin) {
      patch.min = nextMax;
    }
    this.emit({ t: 'APPLY_STYLE', patch });
  }

  onApplyTextStylesToAll(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.applyTextStylesToAll.emit({
      styles: this.store.snapshot((s) => s.ui),
      event
    });
  }

  private clampFontSize(value: number | null | undefined): number {
    const minLimit = 16;
    const maxLimit = 150;
    const numeric = Number(value);
    const base = Number.isFinite(numeric) ? numeric : minLimit;
    const clamped = Math.min(maxLimit, Math.max(minLimit, base));
    const snapped = Math.round(clamped / this.fontSizeStep) * this.fontSizeStep;
    return Math.min(maxLimit, Math.max(minLimit, snapped));
  }

  private syncFontOptionsFromDocumentFonts(): void {
    const known = new Map(this.fontOptions.map((option) => [option.value, option]));
    this.document.fonts?.forEach((fontFace) => {
      const family = fontFace.family.replace(/^["']|["']$/g, '');
      if (!family || known.has(family) || family.includes('primeicons') || family.includes('Pro')) return;
      known.set(family, { label: family, value: family });
    });
    this.fontOptions = Array.from(known.values());
    this.cdr.markForCheck();
  }

  public async generateSnapshot(options?: {
    resolution?: number;
  }): Promise<Blob | null> {
    const originalSelectedIds = this.store.snapshot(
      (state) => state.selectedIds
    );

    try {
      // Hide selection and handles if anything is selected
      if (originalSelectedIds.length > 0) {
        this.bus.emit({ t: 'SELECT', ids: [] });
        // Wait for the event loop to process UI updates (especially for the HTML overlay)
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // Take the snapshot
      const bounds = this.sceneViewport.getSceneBounds();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return null;
      }

      // Кадр в локальных координатах контейнера world, чтобы избежать смещения превью
      const canvas = await this.app.renderer.extract.canvas({
        target: this.world,
        frame: new Rectangle(0, 0, bounds.width, bounds.height),
        resolution: options?.resolution ?? 0.25,
      });

      if (canvas) {
        return new Promise((resolve) => {
          canvas.toBlob?.((data) => resolve(data), 'image/jpeg', 0.8);
        });
      }

      return null;
    } finally {
      // Restore selection state, regardless of whether the snapshot succeeded
      if (originalSelectedIds.length > 0) {
        this.bus.emit({ t: 'SELECT', ids: originalSelectedIds });
      }
    }
  }

  onContextMenu(e: MouseEvent) {
    e.preventDefault();
    this.ctxMenu?.open(e.clientX, e.clientY);
  }

  public resetViewport(): void {
    if (this.world && this.app) {
      this.app.stage.x = 0;
      this.app.stage.y = 0;
      this.app.stage.pivot.set(0, 0);

      this.world.position.set(0, 0);
      this.world.pivot.set(0, 0);
      this.world.scale.set(1);
      this.store.setZoom(1);

      // updateSceneBounds теперь сам установит правильные world.x и world.y
      this.sceneViewport.updateSceneBounds();

      // Сетка закреплена к stage и не требует смещения относительно world
    }
  }

  /**
   * Очищает все ноды со сцены, сбрасывает viewport и историю.
   */
  clearAllNodes() {
    const allNodeIds = Object.keys(this.store.snapshot((s) => s.nodes));
    if (allNodeIds.length > 0) {
      // Используем существующую логику удаления, чтобы история работала корректно,
      // но делаем это одной "тихой" операцией без добавления в историю.
      const allNodes = this.store.snapshot((state) => state.nodes);
      for (const nodeId of allNodeIds) {
        const nodeState = allNodes[nodeId];
        if (nodeState) {
          // Revoke object URLs for assets associated with the node
          if (nodeState.ref instanceof ImageNode && nodeState.ref.assetId) {
            this.assetStorage.revokeAssetObjectURL(nodeState.ref.assetId);
          } else if (
            nodeState.ref instanceof VideoNode &&
            nodeState.ref.assetId
          ) {
            this.assetStorage.revokeAssetObjectURL(nodeState.ref.assetId);
          } else if (
            nodeState.ref instanceof TextNode &&
            nodeState.ref.backgroundImageUrl
          ) {
            this.assetStorage.revokeAssetObjectURL(
              nodeState.ref.backgroundImageUrl
            );
          } else if (
            nodeState.ref instanceof ShapeNode &&
            nodeState.ref.bgAssetId
          ) {
            this.assetStorage.revokeAssetObjectURL(nodeState.ref.bgAssetId);
          } else if (
            nodeState.ref instanceof BrushNode &&
            nodeState.ref.bgAssetId
          ) {
            this.assetStorage.revokeAssetObjectURL(nodeState.ref.bgAssetId);
          }

          this.world.removeChild(nodeState.ref);
          nodeState.destroy$?.next();
          nodeState.destroy$?.complete();
          nodeState.ref.destroy();
        }
      }
      this.store.resetNodes();
      this.bus.emit({ t: 'SELECT', ids: [] });
    }

    // Сбрасываем viewport и историю, чтобы гарантировать чистое состояние
    // после перезагрузки слайда.
    this.resetViewport();
    this.history.clear();
    this.overlay.detachIframe();
  }

  stopScrollDrag(event: Event) {
    const isMoveEvent = event.type.includes('move');
    if (event.cancelable && !isMoveEvent) {
      event.preventDefault();
    }
    event.stopPropagation();
  }

  stopScrollWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  stopSidebarPointer(event: Event): void {
    // Не даём событиям из сайдбара дойти до Pixi stage/canvas.
    // Важно: не используем preventDefault, чтобы не ломать PrimeNG (drag внутри overlay).
    event.stopPropagation();
  }

  onColorPickerPreOpen(): void {
    // Важно: это срабатывает раньше, чем PrimeNG поднимет overlay и раньше,
    // чем ngx-scrollbar может попытаться проскроллить viewport из-за смены фокуса.
    // Никаких preventDefault/stopPropagation тут быть не должно, иначе можно сломать PrimeNG.
    this.lockPropertiesScrollbar();
  }

  onColorPickerOpen(): void {
    this.colorPickerOpen = true;
    this.document.body.classList.add('color-picker-open');

    this.lockPropertiesScrollbar();
  }

  onColorPickerClose(): void {
    this.colorPickerOpen = false;
    this.document.body.classList.remove('color-picker-open');
    this.unlockPropertiesScrollbar();
    this.removeColorPickerKeyGuard?.();
    this.removeColorPickerKeyGuard = undefined;
  }

  private installColorPickerKeyGuard(): void {
    if (this.removeColorPickerKeyGuard) return;

    const handler = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const inColorPicker = !!target.closest(
        '.p-colorpicker, .p-colorpicker-panel, .p-colorpicker-overlay'
      );
      if (!inColorPicker) return;

      const key = event.key;
      const isScrollKey =
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'PageUp' ||
        key === 'PageDown' ||
        key === 'Home' ||
        key === 'End' ||
        key === ' ';

      if (!isScrollKey) return;

      // Главное: не даём событию дойти до ngx-scrollbar/страницы.
      event.stopPropagation();

      // Для PageUp/PageDown/Home/End/Space дополнительно гасим дефолт,
      // чтобы не происходил нативный scroll.
      if (
        key === 'PageUp' ||
        key === 'PageDown' ||
        key === 'Home' ||
        key === 'End' ||
        key === ' '
      ) {
        event.preventDefault();
      }
    };

    this.document.addEventListener('keydown', handler, { capture: true });
    this.removeColorPickerKeyGuard = () => {
      this.document.removeEventListener('keydown', handler, { capture: true } as AddEventListenerOptions);
    };
  }

  private tryFocusColorPickerInput(): void {
    // Без агрессивных фокусов: один раз после открытия пытаемся перевести фокус
    // внутрь overlay, чтобы клавиатура сразу управляла пикером, а не сайдбаром.
    queueMicrotask(() => {
      const panel = this.document.querySelector<HTMLElement>(
        '.p-colorpicker-panel, .p-colorpicker-overlay'
      );
      const input = panel?.querySelector<HTMLInputElement>('input');
      input?.focus();
    });
  }

  private findScrollableElement(root: HTMLElement): HTMLElement | undefined {
    const viewportBySelector = root.querySelector<HTMLElement>(
      '.ng-scroll-viewport, .ng-scrollbar-viewport'
    );
    if (viewportBySelector) return viewportBySelector;

    const candidates: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    return candidates.find((el) => {
      const style = getComputedStyle(el);
      // В ngx-scrollbar реальный скроллируемый элемент иногда имеет overflow: hidden,
      // поэтому ориентируемся в первую очередь на геометрию, а не только на overflow.
      const overflowY = style.overflowY;
      const isPotentialScroller = overflowY !== 'visible';
      return isPotentialScroller && el.scrollHeight > el.clientHeight;
    });
  }

  private lockPropertiesScrollbar(): void {
    if (this.removeScrollbarLock) return;
    const root = this.propertiesScrollbarRef?.nativeElement;
    const viewport = root ? this.findScrollableElement(root) : undefined;
    if (!viewport) return;

    const lockedScrollTop = viewport.scrollTop;

    const onWheel = (event: WheelEvent) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };

    const onSelectStart = (event: Event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };

    const onScroll = () => {
      if (viewport.scrollTop !== lockedScrollTop) {
        // viewport.scrollTop = lockedScrollTop;
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('selectstart', onSelectStart, { passive: false });
    viewport.addEventListener('scroll', onScroll, { passive: true });

    this.removeScrollbarLock = () => {
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('selectstart', onSelectStart);
      viewport.removeEventListener('scroll', onScroll);
    };
  }

  private unlockPropertiesScrollbar(): void {
    this.removeScrollbarLock?.();
    this.removeScrollbarLock = undefined;
  }
}

@Component({
  selector: 'lyri-test-pixi-editor-v2',
  standalone: true,
  imports: [PixiSlideEditorV2Component],
  template: `<lyri-pixi-slide-editor-v2 />`,
})
export class TestPixiEditorV2Component {}
