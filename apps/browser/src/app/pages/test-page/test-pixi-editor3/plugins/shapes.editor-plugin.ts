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
      shapeNode.applyBoxSize(addShape.w ?? 200, addShape.shape === 'line' ? 1 : (addShape.h ?? 120));
      ctx.world.addChild(shapeNode);
      const newId = shapeNode.id; ctx.store.addNode({ id: newId, type: 'shape', ref: shapeNode });
      this.drag.bind(shapeNode, new Subject<void>(), { cfg: ctx.cfg, store: ctx.store, guides: ctx.guides, world: ctx.world, app: ctx.app, bus: ctx.bus, utils: ctx.utils, overlay: ctx.overlay });
      ctx.bus.emit({ t: 'SELECT', ids: [newId] });
    });
  }
}
