import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin } from '../core';
import { filter } from 'rxjs/operators';
import { BrushNode } from '../nodes';
import { Subject } from 'rxjs';
import { DragResizeService } from '../services/drag-resize.service';
import { FederatedPointerEvent, Point } from 'pixi.js';

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
  constructor(private readonly drag: DragResizeService) {}

  init(ctx: EditorContext): void {
    ctx.bus.commands$
      .pipe(filter((command) => command.t === 'START_BRUSH'))
      .subscribe(() => {
        if (this.drawing) return;
        this.drawing = true;
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
          const currentPath = (this.tempNode as unknown as HasPath).path as Point[] | undefined;
          const points: Point[] = currentPath && currentPath.length
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
          const normalized = points.map((pt) => new Point(pt.x - minX, pt.y - minY));
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
          (ctx.app.canvas as unknown as { style?: CSSStyleDeclaration }).style!.cursor = '';
        };

        // attach temporary listeners
        ctx.app.stage.on('pointerdown', onDown);
        ctx.app.stage.on('pointermove', onMove);
        ctx.app.stage.on('pointerup', onUp);
        (ctx.app.canvas as unknown as { style?: CSSStyleDeclaration }).style!.cursor = 'crosshair';
      });
  }
}
