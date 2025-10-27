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
  Assets,
  Container,
  FederatedPointerEvent,
  Graphics,
  Point,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { EDITOR_CONFIG } from './types';
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
import { fromEvent, Subject } from 'rxjs';
import { ContextMenuService } from './services/context-menu.service';
import { AssetStorageService } from './services/asset-storage.service';
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
import { PIXI_EDITOR_PROVIDERS } from './pixi-editor.providers';
import {
  SerializedBrushNode,
  SerializedIframeNode,
  SerializedImageNode,
  SerializedNode,
  SerializedNodeBase,
  SerializedShapeNode,
  SerializedState,
  SerializedTextNode,
  SerializedVideoNode,
} from '@lyri-cast/entities';

type WorldContainer = Container & { app: Application };

@Component({
  selector: 'lyri-pixi-slide-editor-v2',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: 'pixi-editor.component.html',
  styleUrl: 'pixi-editor.component.scss',
  providers: [...PIXI_EDITOR_PROVIDERS()],
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
  aspectRatio: '16:9' | '4:3' | 'none' = '16:9';

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
  // Текущие размеры сцены (с учетом zoom для отрисовки)
  private sceneWidth: number = 1920;
  private sceneHeight: number = 1080;
  // Базовые размеры сцены (без zoom, для сериализации)
  private baseSceneWidth: number = 1920;
  private baseSceneHeight: number = 1080;
  private readonly textFit = inject(TextFitService);
  private readonly drag = inject(DragResizeService);
  private readonly dialog = inject(DialogService);
  private readonly assetStorage = inject(AssetStorageService);
  private readonly overlayService = inject(OverlayService);

  getSceneBounds(): { x: number; y: number; width: number; height: number } {
    const canvasWidth = this.app.renderer.width;
    const canvasHeight = this.app.renderer.height;
    const zoom = this.store.snapshot((s) => s.zoom);

    // These are the dimensions of the scene in world coordinates (without zoom applied)
    const sceneWidth = this.sceneWidth;
    const sceneHeight = this.sceneHeight;

    // Calculate the offset of the scene within the world container
    const sceneOffsetX = (canvasWidth / zoom - sceneWidth) / 2;
    const sceneOffsetY = (canvasHeight / zoom - sceneHeight) / 2;

    return { x: sceneOffsetX, y: sceneOffsetY, width: sceneWidth, height: sceneHeight };
  }

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

    // Инициализируем границы сцены при запуске
    // Небольшая задержка для завершения инициализации PixiJS
    setTimeout(() => {
      this.updateSceneBounds();
    }, 200);
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
            getSceneBounds: () => this.getSceneBounds(),
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
      getSceneBounds: () => this.getSceneBounds(),
    };
    this.plugins.forEach((plugin) => plugin.init(ctx));

    // Context menu
    this.ctxMenu = new ContextMenuService(
      this.hostRef.nativeElement,
      this.bus,
      this.store
    );

    // Инициализируем размеры сцены сразу после создания app
    this.updateSceneBounds();
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
      const n = new TextNode(this.app, this.textFit, this.assetStorage);
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
      const n = new ShapeNode(src.shape, this.assetStorage);
      n.fill = src.fill;
      n.stroke = src.stroke;
      n.lineWidth = src.lineWidth;
      n.applyBoxSize(src.w, src.h);
      return n;
    }
    if (src instanceof BrushNode) {
      const n = new BrushNode(this.assetStorage);
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

    // Определяем размеры сцены на основе соотношения сторон
    const canvasWidth = this.app.renderer.width;
    const canvasHeight = this.app.renderer.height;

    // Учитываем текущий zoom и позицию world
    const zoom = this.store.snapshot((s) => s.zoom);

    if (this.aspectRatio === 'none') {
      // Для 'none' используем размеры canvas
      this.sceneWidth = canvasWidth / zoom;
      this.sceneHeight = canvasHeight / zoom;
      // Базовые размеры без zoom (при zoom=1)
      this.baseSceneWidth = canvasWidth;
      this.baseSceneHeight = canvasHeight;
      return;
    }

    if (this.aspectRatio === '16:9') {
      // Вычисляем размеры для 16:9
      const ratio = 16 / 9;
      if (canvasWidth / canvasHeight > ratio) {
        // Ограничены по высоте
        this.sceneHeight = (canvasHeight * 0.9) / zoom; // 90% высоты canvas с учетом zoom
        this.sceneWidth = this.sceneHeight * ratio;
        // Базовые размеры при zoom=1
        this.baseSceneHeight = canvasHeight * 0.9;
        this.baseSceneWidth = this.baseSceneHeight * ratio;
      } else {
        // Ограничены по ширине
        this.sceneWidth = (canvasWidth * 0.9) / zoom; // 90% ширины canvas с учетом zoom
        this.sceneHeight = this.sceneWidth / ratio;
        // Базовые размеры при zoom=1
        this.baseSceneWidth = canvasWidth * 0.9;
        this.baseSceneHeight = this.baseSceneWidth / ratio;
      }
    } else {
      // 4:3
      const ratio = 4 / 3;
      if (canvasWidth / canvasHeight > ratio) {
        this.sceneHeight = (canvasHeight * 0.9) / zoom;
        this.sceneWidth = this.sceneHeight * ratio;
        // Базовые размеры при zoom=1
        this.baseSceneHeight = canvasHeight * 0.9;
        this.baseSceneWidth = this.baseSceneHeight * ratio;
      } else {
        this.sceneWidth = (canvasWidth * 0.9) / zoom;
        this.sceneHeight = this.sceneWidth / ratio;
        // Базовые размеры при zoom=1
        this.baseSceneWidth = canvasWidth * 0.9;
        this.baseSceneHeight = this.baseSceneWidth / ratio;
      }
    }

    // Создаём контейнер для границ
    const bounds = new Container();
    const g = new Graphics();

    const sceneWidth = this.sceneWidth;
    const sceneHeight = this.sceneHeight;

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

  /**
   * Сериализует текущее состояние редактора в JSON-объект.
   */
  serializeState(): SerializedState {
    const state = this.store.snapshot((s) => s);

    // Вычисляем offset сцены (где начинается рамка aspectRatio)
    // ВАЖНО: offset вычисляется БЕЗ учета zoom, т.к. sceneWidth/Height уже учитывают zoom
    const canvasWidth = this.app.renderer.width;
    const canvasHeight = this.app.renderer.height;
    const zoom = state.zoom;

    // sceneWidth и sceneHeight уже в "мировых" координатах (без zoom)
    // Но offset нужно вычислять в тех же координатах, что и ноды
    // Ноды находятся в мировых координатах world, которые масштабируются zoom
    const sceneOffsetX = (canvasWidth / zoom - this.sceneWidth) / 2;
    const sceneOffsetY = (canvasHeight / zoom - this.sceneHeight) / 2;

    const serializableNodes = Object.values(state.nodes)
      .map((nodeState) => {
        const node = nodeState.ref as NodeBase;
        // Сохраняем координаты относительно начала сцены (рамки aspectRatio)
        const baseData: SerializedNodeBase = {
          id: node.id,
          type: nodeState.type as SerializedNode['type'],
          x: node.x - sceneOffsetX,
          y: node.y - sceneOffsetY,
          width: node.w,
          height: node.h,
          rotation: node.rotation,
          alpha: node.alpha,
        };

        console.log('------------', node);
        if (node instanceof TextNode) {
          return {
            id: node.id,
            type: 'text',
            x: node.x - sceneOffsetX,
            y: node.y - sceneOffsetY,
            alpha: node.alpha,
            width: node.w,
            height: node.h,
            rotation: node.rotation,
            textHtml: node.textHtml,
            style: node.style,
            padding: node.padding,
            bgFillColor: node.bgFillColor,
            bgAssetId: node.bgAssetId, // Store asset ID
            actualFontSize: node.style.actualFontSize,
          } as SerializedTextNode;
        }
        if (node instanceof ImageNode) {
          return {
            ...baseData,
            type: 'image',
            assetId: node.assetId, // Store asset ID
            url: node.url, // Store external URL
          } as SerializedImageNode;
        }
        if (node instanceof VideoNode) {
          return {
            ...baseData,
            type: 'video',
            assetId: node.assetId, // Store asset ID
            url: node.url, // Store external URL
          } as SerializedVideoNode;
        }
        if (node instanceof IframeNode) {
          return {
            ...baseData,
            type: 'iframe',
            url: node.url,
          } as SerializedIframeNode;
        }
        if (node instanceof ShapeNode) {
          return {
            ...baseData,
            type: 'shape',
            shape: node.shape,
            fill: node.fill,
            stroke: node.stroke,
            lineWidth: node.lineWidth,
            bgAssetId: node.bgAssetId, // Store asset ID
          } as SerializedShapeNode;
        }
        if (node instanceof BrushNode) {
          return {
            ...baseData,
            type: 'brush',
            stroke: node.stroke,
            strokeWidth: node.strokeWidth,
            path: (node as any).path?.map((p: Point) => ({ x: p.x, y: p.y })),
            bgAssetId: node.bgAssetId, // Store asset ID
          } as SerializedBrushNode;
        }
        return null;
      })
      .filter((n) => n !== null);

    const result: SerializedState = {
      nodes: serializableNodes,
      zoom: state.zoom,
      sceneBounds: {
        width: this.baseSceneWidth, // Используем базовые размеры без zoom
        height: this.baseSceneHeight,
      },
    };

    console.log('[Editor] Serializing state:', {
      nodesCount: serializableNodes.length,
      sceneWidth: this.sceneWidth,
      sceneHeight: this.sceneHeight,
      baseSceneWidth: this.baseSceneWidth,
      baseSceneHeight: this.baseSceneHeight,
      sceneOffsetX,
      sceneOffsetY,
      zoom,
      aspectRatio: this.aspectRatio,
    });

    return result;
  }

  /**
   * Предварительная загрузка ассетов (изображений, видео) для данного состояния слайда.
   * Использует PixiJS Assets для кэширования.
   */
  async preloadAssets(data: SerializedState): Promise<void> {
    if (!data || !data.nodes) return;

    const urlsToPreload: string[] = [];

    for (const nodeData of data.nodes) {
      if (nodeData.type === 'image' || nodeData.type === 'video') {
        if (nodeData.assetId) {
          const objectURL = await this.assetStorage.getAssetObjectURL(
            nodeData.assetId
          );
          if (objectURL) urlsToPreload.push(objectURL);
        } else if (nodeData.url) {
          urlsToPreload.push(nodeData.url);
        }
      } else if (nodeData.type === 'iframe') {
        if (nodeData.url) {
          urlsToPreload.push(nodeData.url);
        }
      } else if (nodeData.type === 'text' && nodeData.bgAssetId) {
        const objectURL = await this.assetStorage.getAssetObjectURL(
          nodeData.bgAssetId
        );
        if (objectURL) urlsToPreload.push(objectURL);
      } else if (nodeData.type === 'shape' && nodeData.bgAssetId) {
        const objectURL = await this.assetStorage.getAssetObjectURL(
          nodeData.bgAssetId
        );
        if (objectURL) urlsToPreload.push(objectURL);
      } else if (nodeData.type === 'brush' && nodeData.bgAssetId) {
        const objectURL = await this.assetStorage.getAssetObjectURL(
          nodeData.bgAssetId
        );
        if (objectURL) urlsToPreload.push(objectURL);
      }
    }

    const uniqueUrls = Array.from(new Set(urlsToPreload));

    if (uniqueUrls.length > 0) {
      console.log(`[Editor] Preloading ${uniqueUrls.length} assets...`);
      try {
        await Assets.load(uniqueUrls);
        console.log('[Editor] Assets preloaded successfully.');
      } catch (e) {
        console.warn('[Editor] Failed to preload assets:', e);
      }
    }
  }

  /**
   * Десериализует состояние из JSON-объекта и воссоздает сцену.
   * @param data
   */
  deserializeState(data: SerializedState) {
    this.clearAllNodes();
    if (!data || !data.nodes) return;

    // Вычисляем offset сцены для восстановления абсолютных координат
    const canvasWidth = this.app.renderer.width;
    const canvasHeight = this.app.renderer.height;
    const zoom = this.store.snapshot((s) => s.zoom);
    const sceneOffsetX = (canvasWidth / zoom - this.sceneWidth) / 2;
    const sceneOffsetY = (canvasHeight / zoom - this.sceneHeight) / 2;

    data.nodes.forEach((nodeData) => {
      const options = {
        width: nodeData.width,
        height: nodeData.height,
        rotation: nodeData.rotation,
        alpha: nodeData.alpha,
      };

      // Восстанавливаем абсолютные координаты, добавляя offset сцены
      const absoluteX = nodeData.x + sceneOffsetX;
      const absoluteY = nodeData.y + sceneOffsetY;

      switch (nodeData.type) {
        case 'text':
          this.bus.emit({
            t: 'ADD_TEXT',
            x: absoluteX,
            y: absoluteY,
            text: nodeData.textHtml,
            options: {
              ...options,
              style: {
                ...nodeData.style,
                actualFontSize: nodeData.actualFontSize,
              },
              bgFillColor: nodeData.bgFillColor,
              bgAssetId: nodeData.bgAssetId, // Pass asset ID
            },
          });
          break;
        case 'image':
          this.bus.emit({
            t: 'ADD_IMAGE',
            assetId: nodeData.assetId, // Pass asset ID
            url: nodeData.url, // Pass external URL
            x: absoluteX,
            y: absoluteY,
            options: options,
          });
          break;
        case 'video':
          this.bus.emit({
            t: 'ADD_VIDEO',
            assetId: nodeData.assetId, // Pass asset ID
            url: nodeData.url, // Pass external URL
            x: absoluteX,
            y: absoluteY,
            options: options,
          });
          break;
        case 'iframe':
          this.bus.emit({
            t: 'ADD_IFRAME',
            url: nodeData.url,
            x: absoluteX,
            y: absoluteY,
            options: options,
          });
          break;
        case 'shape':
          this.bus.emit({
            t: 'ADD_SHAPE',
            shape: nodeData.shape,
            x: absoluteX,
            y: absoluteY,
            options: {
              ...options,
              fill: nodeData.fill,
              stroke: nodeData.stroke,
              lineWidth: nodeData.lineWidth,
              bgAssetId: nodeData.bgAssetId, // Pass asset ID
            },
          });
          break;
        case 'brush':
          this.bus.emit({
            t: 'ADD_BRUSH',
            path: nodeData.path,
            x: absoluteX,
            y: absoluteY,
            options: {
              ...options,
              stroke: nodeData.stroke,
              strokeWidth: nodeData.strokeWidth,
              bgAssetId: nodeData.bgAssetId, // Pass asset ID
            },
          });
          break;
      }
    });
  }

  /**
   * Очищает все ноды со сцены.
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
          this.world.removeChild(nodeState.ref);
          nodeState.destroy$?.next();
          nodeState.destroy$?.complete();
          nodeState.ref.destroy();
        }
      }
      this.store.resetNodes();
      this.bus.emit({ t: 'SELECT', ids: [] });
    }
  }
}

@Component({
  selector: 'lyri-test-pixi-editor-v2',
  standalone: true,
  imports: [CommonModule, PixiSlideEditorV2Component],
  template: `<lyri-pixi-slide-editor-v2 />`,
})
export class TestPixiEditorV2Component {}
