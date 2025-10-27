import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin, NodeBase } from '../core';
import { filter, takeUntil } from 'rxjs/operators';
import { BrushNode, GroupNode } from '../nodes';
import { Subject } from 'rxjs';
import { DragResizeService } from '../services/drag-resize.service';
import { FederatedPointerEvent, Point } from 'pixi.js';
import { AddNodeCommand } from '../services';

/**
 * BrushPlugin enables freehand drawing to create BrushNode paths.
 *
 * Flow:
 * - START_BRUSH switches the editor into a temporary drawing mode.
 * - Pointer events on the stage collect points, expanding the node box as needed.
 * - On pointerup, the node is registered, bound to drag/resize, and selected.
 */
@Injectable()
export class BrushPlugin implements EditorPlugin {
  id = 'brush';
  private drawing = false;
  private tempNode?: BrushNode;
  private destroy$ = new Subject<void>();

  constructor(private readonly drag: DragResizeService) {}

  init(ctx: EditorContext): void {
    ctx.bus.commands$
      .pipe(filter((command) => command.t === 'START_BRUSH'), takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.drawing) return;
        this.drawing = true;
        ctx.store.setBrushActive(true);
        const ui = ctx.store.snapshot((s) => s.ui);
        let startWorldPoint: Point | null = null;

        const onDown = (event: FederatedPointerEvent) => {
          if (!this.drawing) return;
          startWorldPoint = ctx.utils.toWorldLocal(event, ctx.world);
          const node = new BrushNode();
          node.x = startWorldPoint.x;
          node.y = startWorldPoint.y;
          node.applyBoxSize(1, 1);
          node.setStyle(ui.color || 0xffffff, ui.strokeWidth || 4);
          ctx.world.addChild(node);
          this.tempNode = node;
          // record first point in local space
          node.setPath([new Point(0, 0)]);
        };

        const onMove = (event: FederatedPointerEvent) => {
          if (!this.drawing || !this.tempNode || !startWorldPoint) return;
          const worldPoint = ctx.utils.toWorldLocal(event, ctx.world);
          const localX = worldPoint.x - this.tempNode.x;
          const localY = worldPoint.y - this.tempNode.y;
          type HasPath = { path?: Point[] };
          const currentPath = (this.tempNode as unknown as HasPath).path as
            | Point[]
            | undefined;
          const points: Point[] =
            currentPath && currentPath.length
              ? [...currentPath, new Point(localX, localY)]
              : [new Point(localX, localY)];
          this.tempNode.setPath(points);
          // grow box
          const minX = Math.min(...points.map((pt) => pt.x));
          const minY = Math.min(...points.map((pt) => pt.y));
          const maxX = Math.max(...points.map((pt) => pt.x));
          const maxY = Math.max(...points.map((pt) => pt.y));
          this.tempNode.x += minX;
          this.tempNode.y += minY;
          const normalized = points.map(
            (pt) => new Point(pt.x - minX, pt.y - minY)
          );
          this.tempNode.w = Math.max(1, maxX - minX);
          this.tempNode.h = Math.max(1, maxY - minY);
          this.tempNode.setPath(normalized);
          this.tempNode.drawHandles();
        };

        const onUp = () => {
          if (!this.drawing || !this.tempNode) return;
          const node = this.tempNode;
          this.tempNode = undefined;
          this.drawing = false;
          ctx.store.setBrushActive(false);
          const newId = node.id;
          ctx.store.addNode({ id: newId, type: 'brush', ref: node });
          this.drag.bind(node, new Subject<void>(), {
            cfg: ctx.cfg,
            store: ctx.store,
            guides: ctx.guides,
            world: ctx.world,
            app: ctx.app,
            bus: ctx.bus,
            utils: ctx.utils,
            overlay: ctx.overlay,
          });
          ctx.bus.emit({ t: 'SELECT', ids: [newId] });
          // cleanup events
          ctx.app.stage.off('pointerdown', onDown);
          ctx.app.stage.off('pointermove', onMove);
          ctx.app.stage.off('pointerup', onUp);
          (
            ctx.app.canvas as unknown as { style?: CSSStyleDeclaration }
          ).style!.cursor = '';
        };

        // attach temporary listeners
        ctx.app.stage.on('pointerdown', onDown);
        ctx.app.stage.on('pointermove', onMove);
        ctx.app.stage.on('pointerup', onUp);
        (
          ctx.app.canvas as unknown as { style?: CSSStyleDeclaration }
        ).style!.cursor = 'crosshair';
      });

    // ADD_BRUSH: create and select a new brush node from data
    ctx.bus.commands$
      .pipe(filter((command) => command.t === 'ADD_BRUSH'), takeUntil(this.destroy$))
      .subscribe((cmd) => {
        const addBrush = cmd as Extract<
          import('../services/command-bus.service').EditorCommand,
          { t: 'ADD_BRUSH' }
        >;
        const brushNode = new BrushNode();
        brushNode.x = addBrush.x ?? 100;
        brushNode.y = addBrush.y ?? 100;
        brushNode.applyBoxSize(
          addBrush.options?.width ?? 200,
          addBrush.options?.height ?? 200
        );
        brushNode.setPath(addBrush.path.map((p) => new Point(p.x, p.y)));
        brushNode.setStyle(
          addBrush.options?.stroke ?? 0xffffff,
          addBrush.options?.strokeWidth ?? 4
        );

        const nodeState = {
          id: brushNode.id,
          type: 'brush' as const,
          ref: brushNode,
        };

        const command = new AddNodeCommand(nodeState, ctx.world, ctx.store);
        ctx.history.execute(command);

        this.drag.bind(brushNode, new Subject<void>(), {
          cfg: ctx.cfg,
          store: ctx.store,
          guides: ctx.guides,
          world: ctx.world,
          app: ctx.app,
          bus: ctx.bus,
          utils: ctx.utils,
          overlay: ctx.overlay,
          history: ctx.history,
        });

        ctx.bus.emit({ t: 'SELECT', ids: [brushNode.id] });
      });

    // Обработка команд для фона brush-элементов
    const applyToSelection = (fn: (node: BrushNode) => void) => {
      const selectedIds = ctx.store.snapshot((s) => s.selectedIds);
      const nodeMap = ctx.store.snapshot((s) => s.nodes);
      const visit = (n: NodeBase) => {
        if (n instanceof BrushNode) fn(n);
        else if (n instanceof GroupNode) {
          for (const ch of n.children) if (ch instanceof NodeBase) visit(ch);
        }
      };
      for (const id of selectedIds) {
        const n = nodeMap[id]?.ref as NodeBase | undefined;
        if (n) visit(n);
      }
    };

    ctx.bus.commands$
      .pipe(filter((c) => c.t === 'SET_BRUSH_BACKGROUND'), takeUntil(this.destroy$))
      .subscribe(async (cmd) => {
        const url = (
          cmd as Extract<
            import('../services/command-bus.service').EditorCommand,
            { t: 'SET_BRUSH_BACKGROUND' }
          >
        ).url;
        const base64Url = await ctx.utils.urlToBase64(url);
        applyToSelection((b) => {
          void b.setBackground(base64Url);
        });
      });

    ctx.bus.commands$
      .pipe(filter((c) => c.t === 'CLEAR_BRUSH_BACKGROUND'), takeUntil(this.destroy$))
      .subscribe(() => {
        applyToSelection((b) => b.clearBackground());
      });
  }

  dispose(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
