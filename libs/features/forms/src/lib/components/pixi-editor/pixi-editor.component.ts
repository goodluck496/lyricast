import { EditorSerializerService } from './services/editor-serializer.service';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
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

type WorldContainer = Container & { app: Application };

@Component({
  selector: 'lyri-pixi-slide-editor-v2',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: 'pixi-editor.component.html',
  styleUrl: 'pixi-editor.component.scss',
  providers: [...PIXI_EDITOR_PROVIDERS()],
})
export class PixiSlideEditorV2Component
  implements OnInit, AfterViewInit, OnDestroy
{
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
  aspectRatio: '16:9' | '4:3' | 'none' = '16:9';

  readonly cfg = inject(EDITOR_CONFIG);
  readonly store = inject(EditorStore);
  readonly bus = inject(CommandBusService);
  readonly utils = inject(EditorUtilsService);
  readonly overlay = inject(OverlayService);
  readonly history = inject(HistoryService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  public readonly serializer = inject(EditorSerializerService);
  private readonly nodeFactory = inject(NodeFactoryService);
  private readonly sceneViewport = inject(SceneViewportService);

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
    this.serializer.sceneWidth = this.sceneViewport.sceneWidth;
    this.serializer.sceneHeight = this.sceneViewport.sceneHeight;
    // Initialize node factory with component's PixiJS context
    this.nodeFactory.app = this.app;

    // Initialize scene viewport service with component's PixiJS context
    this.sceneViewport.app = this.app;
    this.sceneViewport.world = this.world;
    this.sceneViewport.aspectRatio = this.aspectRatio;
  }

  ngOnDestroy(): void {
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

      const canvas = await this.app.renderer.extract.canvas({
        target: this.world,
        frame: new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height),
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

      // Обновляем позицию сетки, чтобы она соответствовала сдвигу world
      if (this.grid) {
        this.grid.tilePosition.set(-this.world.x, -this.world.y);
      }
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
}

@Component({
  selector: 'lyri-test-pixi-editor-v2',
  standalone: true,
  imports: [CommonModule, PixiSlideEditorV2Component],
  template: `<lyri-pixi-slide-editor-v2 />`,
})
export class TestPixiEditorV2Component {}
