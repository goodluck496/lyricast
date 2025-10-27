import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin } from '../core';
import { filter } from 'rxjs/operators';
import { EditorCommand } from '../services/command-bus.service';
import { ShapeNode } from '../nodes';
import { Subject } from 'rxjs';
import { DragResizeService } from '../services/drag-resize.service';

/**
 * ShapesPlugin creates basic geometric nodes (rect, ellipse, line).
 */
@Injectable()
export class ShapesPlugin implements EditorPlugin {
  id = 'shapes';
  constructor(private readonly drag: DragResizeService) {}
  init(ctx: EditorContext): void {
    ctx.bus.commands$.pipe(filter((command) => command.t === 'ADD_SHAPE')).subscribe((cmd) => {
      const addShape = cmd as Extract<EditorCommand, { t: 'ADD_SHAPE' }>;
      const shapeNode = new ShapeNode(addShape.shape);
      shapeNode.x = addShape.x;
      shapeNode.y = addShape.y;

      shapeNode.applyBoxSize(addShape?.options?.width ?? 200, addShape?.shape === 'line' ? 1 : (addShape?.options?.height ?? 120));
      ctx.world.addChild(shapeNode);
      const newId = shapeNode.id; ctx.store.addNode({ id: newId, type: 'shape', ref: shapeNode });
      this.drag.bind(shapeNode, new Subject<void>(), { cfg: ctx.cfg, store: ctx.store, guides: ctx.guides, world: ctx.world, app: ctx.app, bus: ctx.bus, utils: ctx.utils, overlay: ctx.overlay });
      ctx.bus.emit({ t: 'SELECT', ids: [newId] });
    });

    // Set/Clear background on selected shape(s)
    ctx.bus.commands$.pipe(filter((command) => command.t === 'SET_SHAPE_BACKGROUND')).subscribe(async (cmd) => {
      const url = (cmd as Extract<EditorCommand, { t: 'SET_SHAPE_BACKGROUND' }>).url;
      const base64Url = await ctx.utils.urlToBase64(url);
      const ids = ctx.store.snapshot(s => s.selectedIds) || [];
      const nodes = ctx.store.snapshot(s => s.nodes);
      for (const id of ids) {
        const ref = nodes[id]?.ref;
        if (ref instanceof ShapeNode && ref.shape !== 'line') {
          await ref.setBackground(base64Url);
        }
      }
    });
    ctx.bus.commands$.pipe(filter((command) => command.t === 'CLEAR_SHAPE_BACKGROUND')).subscribe(() => {
      const ids = ctx.store.snapshot(s => s.selectedIds) || [];
      const nodes = ctx.store.snapshot(s => s.nodes);
      for (const id of ids) {
        const ref = nodes[id]?.ref;
        if (ref instanceof ShapeNode && ref.shape !== 'line') {
          ref.clearBackground();
        }
      }
    });

    // Set fill color from current UI color
    ctx.bus.commands$.pipe(filter((command) => command.t === 'SET_SHAPE_FILL')).subscribe((cmd) => {
      const color = (cmd as Extract<EditorCommand, { t: 'SET_SHAPE_FILL' }>).color >>> 0;
      const ids = ctx.store.snapshot(s => s.selectedIds) || [];
      const nodes = ctx.store.snapshot(s => s.nodes);
      for (const id of ids) {
        const ref = nodes[id]?.ref;
        if (ref instanceof ShapeNode) {
          ref.setFillColor(color);
        }
      }
    });
  }
}
