import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin } from '../core';
import { filter, takeUntil } from 'rxjs/operators';
import { EditorCommand } from '../services/command-bus.service';
import { ShapeNode } from '../nodes';
import { Subject } from 'rxjs';
import { DragResizeService } from '../services/drag-resize.service';
import { AssetStorageService } from '../services/asset-storage.service';
import { ChangeBackgroundCommand } from '../services/history-commands';

/**
 * ShapesPlugin creates basic geometric nodes (rect, ellipse, line).
 */
@Injectable()
export class ShapesPlugin implements EditorPlugin {
  id = 'shapes';
  private destroy$ = new Subject<void>();

  constructor(
    private readonly drag: DragResizeService,
    private readonly assetStorage: AssetStorageService
  ) {}
  init(ctx: EditorContext): void {
    ctx.bus.commands$
      .pipe(
        filter((command) => command.t === 'ADD_SHAPE'),
        takeUntil(this.destroy$)
      )
      .subscribe((cmd) => {
        const addShape = cmd as Extract<EditorCommand, { t: 'ADD_SHAPE' }>;
        const shapeNode = new ShapeNode(addShape.shape, this.assetStorage);
        shapeNode.x = addShape.x;
        shapeNode.y = addShape.y;

        if (typeof addShape.options?.fill === 'number') {
          shapeNode.setFillColor(addShape.options.fill);
        }
        if (typeof addShape.options?.stroke === 'number') {
          shapeNode.stroke = addShape.options.stroke;
        }
        if (typeof addShape.options?.lineWidth === 'number') {
          shapeNode.lineWidth = addShape.options.lineWidth;
        }
        if (addShape.options?.bgAssetId) {
          void shapeNode.setBackground(addShape.options.bgAssetId);
        }

        shapeNode.applyBoxSize(
          addShape?.options?.width ?? 200,
          addShape?.shape === 'line' ? 1 : addShape?.options?.height ?? 120
        );
        ctx.world.addChild(shapeNode);
        const newId = shapeNode.id;
        const destroy$ = new Subject<void>();
        ctx.store.addNode({
          id: newId,
          type: 'shape',
          ref: shapeNode,
          destroy$,
        });
        this.drag.bind(shapeNode, destroy$, {
          cfg: ctx.cfg,
          store: ctx.store,
          guides: ctx.guides,
          world: ctx.world,
          app: ctx.app,
          bus: ctx.bus,
          utils: ctx.utils,
          overlay: ctx.overlay,
          history: ctx.history,
          getSceneBounds: ctx.getSceneBounds,
        });
        ctx.bus.emit({ t: 'SELECT', ids: [newId] });
      });

    // Set/Clear background on selected shape(s)
    ctx.bus.commands$
      .pipe(
        filter((command) => command.t === 'SET_SHAPE_BACKGROUND'),
        takeUntil(this.destroy$)
      )
      .subscribe(async (cmd) => {
        const setBgCmd = cmd as Extract<
          EditorCommand,
          { t: 'SET_SHAPE_BACKGROUND' }
        >;
        const source = setBgCmd.url || setBgCmd.assetId;
        if (!source) return;

        const ids = ctx.store.snapshot((s) => s.selectedIds) || [];
        const nodes = ctx.store.snapshot((s) => s.nodes);

        for (const id of ids) {
          const ref = nodes[id]?.ref;
          if (ref instanceof ShapeNode && ref.shape !== 'line') {
            const newAssetId = await this.assetStorage.ensureAssetIsLocal(
              source
            );

            if (newAssetId) {
              const command = new ChangeBackgroundCommand(
                ref,
                ref.bgAssetId, // old assetId
                newAssetId // new assetId
              );
              ctx.history.execute(command);
            }
          }
        }
      });
    ctx.bus.commands$
      .pipe(
        filter((command) => command.t === 'CLEAR_SHAPE_BACKGROUND'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        const ids = ctx.store.snapshot((s) => s.selectedIds) || [];
        const nodes = ctx.store.snapshot((s) => s.nodes);
        for (const id of ids) {
          const ref = nodes[id]?.ref;
          if (ref instanceof ShapeNode && ref.shape !== 'line') {
            ref.clearBackground();
          }
        }
      });

    // Set fill color from current UI color
    ctx.bus.commands$
      .pipe(
        filter((command) => command.t === 'SET_SHAPE_FILL'),
        takeUntil(this.destroy$)
      )
      .subscribe((cmd) => {
        const color =
          (cmd as Extract<EditorCommand, { t: 'SET_SHAPE_FILL' }>).color >>> 0;
        const ids = ctx.store.snapshot((s) => s.selectedIds) || [];
        const nodes = ctx.store.snapshot((s) => s.nodes);
        for (const id of ids) {
          const ref = nodes[id]?.ref;
          if (ref instanceof ShapeNode) {
            ref.setFillColor(color);
          }
        }
      });
  }

  dispose(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
