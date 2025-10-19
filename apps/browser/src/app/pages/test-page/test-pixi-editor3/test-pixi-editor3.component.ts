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
  Point,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { DEFAULT_CONFIG, EDITOR_CONFIG } from './types';
import { EDITOR_PLUGINS, EditorContext, EditorPlugin, NodeBase } from './core';
import { EditorStore } from './services/editor-store.service';
import {
  CommandBusService,
  EditorCommand,
} from './services/command-bus.service';
import { EditorUtilsService } from './services/editor-utils.service';
import { TextFitService } from './services/text-fit.service';
import { DialogService } from './services/dialog.service';
import { DragResizeService } from './services/drag-resize.service';
import { OverlayService } from './services/overlay.service';
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
          [disabled]="(vm.selectedIds?.length || 0) < 2"
        >
          Group
        </button>
        <button (click)="onUngroup()" [disabled]="selectedKind !== 'group'">
          Ungroup
        </button>
        <button
          (click)="emit({ t: 'DUPLICATE' })"
          [disabled]="!vm.selectedIds?.length"
        >
          Duplicate
        </button>
        <button
          (click)="emit({ t: 'DELETE' })"
          [disabled]="!vm.selectedIds?.length"
        >
          Delete
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
            min="1"
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
        <label>
          <input
            type="checkbox"
            [ngModel]="vm.ui.list"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { list: !!$event } })
            "
          />
          Bulleted
        </label>
      </div>
    </ng-container>
    <div class="host" #host (contextmenu)="onContextMenu($event)"></div>
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
    EditorUtilsService,
    CommandBusService,
    EditorStore,
    TextFitService,
    DialogService,
    DragResizeService,
    OverlayService,
    TextPlugin,
    MediaPlugin,
    IframePlugin,
    ShapesPlugin,
    BrushPlugin,
    GroupingPlugin,
    ClipboardPlugin,
    TextFitService,
    // Multi providers for EDITOR_PLUGINS token
    {
      provide: EDITOR_PLUGINS,
      useFactory: () => inject(TextPlugin) as EditorPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useFactory: () => inject(MediaPlugin) as EditorPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useFactory: () => inject(IframePlugin) as EditorPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useFactory: () => inject(ShapesPlugin) as EditorPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useFactory: () => inject(BrushPlugin) as EditorPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useFactory: () => inject(GroupingPlugin) as EditorPlugin,
      multi: true,
    },
    {
      provide: EDITOR_PLUGINS,
      useFactory: () => inject(ClipboardPlugin) as EditorPlugin,
      multi: true,
    },
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

  readonly cfg = inject(EDITOR_CONFIG);
  readonly store = inject(EditorStore);
  readonly bus = inject(CommandBusService);
  readonly utils = inject(EditorUtilsService);
  readonly overlay = inject(OverlayService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  app!: Application;
  world!: Container & { app: Application };
  grid!: TilingSprite;
  guides!: GuideLayer;
  private readonly textFit = inject(TextFitService);
  private readonly drag = inject(DragResizeService);
  private readonly dialog = inject(DialogService);

  // Plugin instances provided via DI multi-token
  private plugins = inject(EDITOR_PLUGINS);

  vm$ = this.store.select((s) => s);

  private destroy$ = new Subject<void>();
  private ctxMenu?: ContextMenuService;

  ngOnInit() {}
  ngAfterViewInit(): void {
    void this.initPixi();
    // track brush active state for toolbar button highlight
    this.store.brushActive$.pipe(takeUntil(this.destroy$)).subscribe((v) => {
      this.brushActive = v;
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
        tap((e) => e.preventDefault()),
        filter((e) => e.target === this.app.stage),
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
      .subscribe((ev) => {
        ev.preventDefault();
        // Try to select the node under cursor before opening menu
        const hostRect = host.getBoundingClientRect();
        const px = ev.clientX - hostRect.left;
        const py = ev.clientY - hostRect.top;
        const nodesUnderCursor: NodeBase[] = [];
        for (let i = 0; i < this.world.children.length; i++) {
          const c = this.world.children[i];
          if (c instanceof NodeBase) {
            const b = c.getBounds();
            if (
              px >= b.x &&
              px <= b.x + b.width &&
              py >= b.y &&
              py <= b.y + b.height
            ) {
              nodesUnderCursor.push(c);
            }
          }
        }
        if (nodesUnderCursor.length) {
          // choose the topmost by world z-order (last among matched in children traversal)
          const topmost = nodesUnderCursor[nodesUnderCursor.length - 1];
          const sel = this.store.snapshot((s) => s.selectedIds);
          if (!sel.includes(topmost.id)) {
            this.bus.emit({ t: 'SELECT', ids: [topmost.id] });
          }
        }
        // If an iframe is selected and the right-click is inside it, enable interaction instead of opening menu
        const selectedId = this.store.snapshot((s) => s.selectedIds)[0];
        if (selectedId) {
          const ref = this.store.snapshot((s) => s.nodes)[selectedId]
            ?.ref as NodeBase;
          if (ref instanceof IframeNode) {
            const b = ref.getBounds();
            const m = 10; // same inset as overlay
            if (
              px >= b.x + m &&
              px <= b.x + b.width - m &&
              py >= b.y + m &&
              py <= b.y + b.height - m
            ) {
              this.overlay.attachIframe(ref);
              this.overlay.setIframeInteractive(true);
              return; // do not open context menu
            }
          }
        }
        this.ctxMenu?.open(ev.clientX, ev.clientY);
      });

    // Hotkeys: Delete to remove, Esc to deselect (when not typing in inputs)
    fromEvent<KeyboardEvent>(window, 'keydown')
      .pipe(takeUntil(this.destroy$))
      .subscribe((ev) => {
        const tag = (ev.target as HTMLElement | null)?.tagName;
        const editable = (ev.target as HTMLElement | null)?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
        // Select all: Ctrl/Cmd + A using layout-agnostic code
        if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyA') {
          ev.preventDefault();
          const topLevelIds = this.world.children
            .filter((c): c is NodeBase => c instanceof NodeBase)
            .map((c) => c.id);
          this.bus.emit({ t: 'SELECT', ids: topLevelIds });
          return;
        }
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          ev.preventDefault();
          this.bus.emit({ t: 'DELETE' });
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
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
      .pipe(filter((c) => c.t === 'SELECT'))
      .subscribe((cmd) => {
        const c = cmd as Extract<EditorCommand, { t: 'SELECT' }>;
        this.store.setSelection(c.ids);

        // Toggle selection visuals on all nodes
        const all = this.store.snapshot((s) => s.nodes);
        const selSet = new Set(c.ids || []);
        for (const id of Object.keys(all)) {
          const ref = all[id]?.ref;
          if (ref) {
            ref.setSelected(selSet.has(id));
          }
        }

        // Clear guides if nothing is selected
        if (!c.ids || c.ids.length === 0) {
          this.guides.draw([]);
        }

        // Update UI toolbar to reflect selected node(s)
        const updateUIFromSelection = () => {
          const ids = c.ids || [];
          // update selectedKind for toolbar highlighting
          this.selectedKind = undefined;
          if (!ids.length) return;
          const firstId = ids[0];
          const ref = this.store.snapshot((s) => s.nodes)[firstId]?.ref as
            | NodeBase
            | undefined;
          if (ref instanceof TextNode) this.selectedKind = 'text';
          else if (ref instanceof ImageNode) this.selectedKind = 'image';
          else if (ref instanceof VideoNode) this.selectedKind = 'video';
          else if (ref instanceof IframeNode) this.selectedKind = 'iframe';
          else if (ref instanceof ShapeNode) this.selectedKind = 'shape';
          else if (ref instanceof GroupNode) this.selectedKind = 'group';
          else if (ref instanceof BrushNode) this.selectedKind = 'brush';
          // enable/disable background buttons
          this.canSetBg = !!(
            ref &&
            ((ref instanceof ShapeNode &&
              (ref as ShapeNode).shape !== 'line') ||
              ref instanceof TextNode)
          );
          const pickTextFrom = (node?: NodeBase): TextNode | undefined => {
            if (!node) return undefined;
            if (node instanceof TextNode) return node;
            if (node instanceof GroupNode) {
              for (const ch of node.children) {
                if (ch instanceof TextNode) return ch;
                if (ch instanceof GroupNode) {
                  const found = pickTextFrom(ch);
                  if (found) return found;
                }
              }
            }
            return undefined;
          };
          const tn = pickTextFrom(ref);
          if (tn) {
            this.store.setUI({
              font: tn.style.font,
              weight: tn.style.weight,
              color: tn.style.color,
              colorHex: tn.style.colorHex,
              align: tn.style.align,
              lineHeight: tn.style.lineHeight,
              min: tn.style.min,
              max: tn.style.max,
              list: tn.style.list,
            });
          } else if (ref instanceof BrushNode) {
            this.store.setUI({
              color: (ref as BrushNode).stroke,
              colorHex: this.utils.numberToHex((ref as BrushNode).stroke),
              strokeWidth: (ref as BrushNode).strokeWidth,
            });
          } else if (ref instanceof ShapeNode) {
            const sn = ref as ShapeNode;
            const sw =
              sn.shape === 'line'
                ? 1
                : this.store.snapshot((s) => s.ui).strokeWidth || 4;
            this.store.setUI({
              color: sn.stroke,
              colorHex: this.utils.numberToHex(sn.stroke),
              strokeWidth: sw,
            });
          }
        };
        updateUIFromSelection();

        // For iframe nodes: do not recreate/detach on selection changes; just ensure it's attached and non-interactive
        const selectedId = c.ids?.length === 1 ? c.ids[0] : undefined;
        if (selectedId) {
          const ref = this.store.snapshot((s) => s.nodes)[selectedId]
            ?.ref as NodeBase;
          if (ref instanceof IframeNode) {
            this.overlay.attachIframe(ref);
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

    this.bus.commands$.pipe(filter((c) => c.t === 'ZOOM')).subscribe((cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'ZOOM' }>;
      this.store.setZoom(c.z);
      this.world.scale.set(c.z);
      this.guides.draw([]);
      const sel = this.store.snapshot((s) => s.selectedIds)[0];
      if (sel) {
        const ref = this.store.snapshot((s) => s.nodes)[sel]?.ref as NodeBase;
        if (ref) this.overlay.syncToNode(ref);
      }
    });

    this.bus.commands$
      .pipe(
        filter(
          (c): c is Extract<EditorCommand, { t: 'SNAP' }> => c.t === 'SNAP'
        )
      )
      .subscribe((cmd) => this.store.setSnap(cmd.on));
    this.bus.commands$
      .pipe(
        filter(
          (c): c is Extract<EditorCommand, { t: 'GUIDES' }> => c.t === 'GUIDES'
        )
      )
      .subscribe((cmd) => {
        const on = cmd.on;
        this.store.setGuides(on);
        this.guides.enabled = on;
        this.guides.draw([]);
      });

    this.bus.commands$.pipe(filter((c) => c.t === 'DELETE')).subscribe(() => {
      const ids = this.store.snapshot((s) => s.selectedIds);
      const nodes = this.store.snapshot((s) => s.nodes);
      for (const id of ids) {
        const ref = nodes[id]?.ref;
        if (ref) {
          if (ref instanceof IframeNode) {
            this.overlay.detachIframe();
          }
          this.world.removeChild(ref);
          // Container.destroy supports options; ensure children are destroyed
          ref.destroy({ children: true });
        }
        this.store.removeNode(id);
      }
      this.bus.emit({ t: 'SELECT', ids: [] });
    });

    this.bus.commands$
      .pipe(filter((c) => c.t === 'DUPLICATE'))
      .subscribe(() => {
        const ids = this.store.snapshot((s) => s.selectedIds);
        const nodes = this.store.snapshot((s) => s.nodes);
        const newIds: string[] = [];
        for (const id of ids) {
          const ns = nodes[id];
          if (!ns) continue;
          const ref = ns.ref as NodeBase;
          const clone = this.cloneNode(ref);
          if (!clone) continue;
          clone.x = ref.x + 24;
          clone.y = ref.y + 24;
          this.world.addChild(clone);
          this.store.addNode({
            id: clone.id,
            type: this.getNodeType(clone),
            ref: clone,
          });
          this.drag.bind(clone, new Subject<void>(), {
            cfg: this.cfg,
            store: this.store,
            guides: this.guides,
            world: this.world,
            app: this.app,
            bus: this.bus,
            utils: this.utils,
            overlay: this.overlay,
          });
          newIds.push(clone.id);
        }
        if (newIds.length) this.bus.emit({ t: 'SELECT', ids: newIds });
      });

    // Z-index commands: reorder selected nodes among top-level NodeBase children
    const reorder = (mode: 'front' | 'back' | 'forward' | 'backward') => {
      const selected = this.store.snapshot((s) => s.selectedIds) || [];
      if (!selected.length) return;
      const children = this.world.children;
      const nodeChildren = children.filter(
        (c): c is NodeBase => c instanceof NodeBase
      );
      if (!nodeChildren.length) return;
      const indexOfInWorld = (n: NodeBase) => children.indexOf(n);
      const firstWorldIndex = indexOfInWorld(nodeChildren[0]);
      const lastWorldIndex = indexOfInWorld(
        nodeChildren[nodeChildren.length - 1]
      );

      const isSelected = new Set(selected);
      const selectedNodes = nodeChildren.filter((n) => isSelected.has(n.id));
      if (!selectedNodes.length) return;

      const moveToWorldIndex = (n: NodeBase, worldIndex: number) => {
        const clamped = Math.max(0, Math.min(children.length - 1, worldIndex));
        if (children.indexOf(n) !== clamped)
          this.world.setChildIndex(n, clamped);
      };

      if (mode === 'front') {
        // Keep relative order: process top-to-bottom order
        let idx = lastWorldIndex;
        for (const n of selectedNodes) {
          moveToWorldIndex(n, idx);
          idx++;
        }
      } else if (mode === 'back') {
        let idx = firstWorldIndex;
        for (const n of selectedNodes) {
          moveToWorldIndex(n, idx);
          idx++;
        }
      } else if (mode === 'forward' || mode === 'backward') {
        const step = mode === 'forward' ? +1 : -1;
        // For stable move, sort by current world index accordingly
        const sorted = [...selectedNodes].sort(
          (a, b) => indexOfInWorld(a) - indexOfInWorld(b)
        );
        const list = step > 0 ? sorted.reverse() : sorted; // moving forward: start from topmost
        for (const n of list) {
          const cur = indexOfInWorld(n);
          const target = cur + step;
          // Only swap if the neighbor is a NodeBase; otherwise skip
          const neighbor = children[target];
          if (neighbor instanceof NodeBase) moveToWorldIndex(n, target);
        }
      }
    };

    this.bus.commands$
      .pipe(filter((c) => c.t === 'BRING_TO_FRONT'))
      .subscribe(() => reorder('front'));
    this.bus.commands$
      .pipe(filter((c) => c.t === 'SEND_TO_BACK'))
      .subscribe(() => reorder('back'));
    this.bus.commands$
      .pipe(filter((c) => c.t === 'BRING_FORWARD'))
      .subscribe(() => reorder('forward'));
    this.bus.commands$
      .pipe(filter((c) => c.t === 'SEND_BACKWARD'))
      .subscribe(() => reorder('backward'));

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
    };
    this.plugins.forEach((p) => p.init(ctx));

    // Demo nodes (optional)
    this.bus.emit({
      t: 'ADD_TEXT',
      x: 120,
      y: 100,
      text: 'Благодать Твоя, как река, Наполняет сердце моё…',
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
      n.text = src.text;
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
