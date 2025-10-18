import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin, NodeBase } from '../core';
import { filter } from 'rxjs/operators';
import { EditorCommand } from '../services/command-bus.service';
import { Subject } from 'rxjs';
import { FederatedPointerEvent } from 'pixi.js';
import { TextFitService } from '../services/text-fit.service';
import { DragResizeService } from '../services/drag-resize.service';
import { BrushNode, GroupNode, ShapeNode, TextNode } from '../nodes';
import { Align, UiTextStyles } from '../types';

/**
 * TextPlugin handles creating text nodes and applying style patches to the selection.
 *
 * Responsibilities:
 * - React to ADD_TEXT commands and add a new TextNode to the stage.
 * - React to APPLY_STYLE and update Text/Brush/Shape nodes (recursively through groups).
 * - Bind drag/resize interactions and attach a textarea editor on double-click.
 */
@Injectable()
export class TextPlugin implements EditorPlugin {
  id = 'text';
  constructor(private readonly fitter: TextFitService, private readonly drag: DragResizeService) {}

  /** Initialize subscriptions for text-related editor commands. */
  init(ctx: EditorContext): void {
    // ADD_TEXT: create and select a new text node
    ctx.bus.commands$.pipe(filter((command) => command.t === 'ADD_TEXT')).subscribe((cmd) => {
      const addText = cmd as Extract<EditorCommand, { t: 'ADD_TEXT' }>;
      const textNode = new TextNode(ctx.app, this.fitter);
      textNode.x = addText.x ?? 80;
      textNode.y = addText.y ?? 80;
      textNode.applyBoxSize(addText.w ?? 600, addText.h ?? 240);
      textNode.text = addText.text ?? 'New text';
      ctx.world.addChild(textNode);
      void textNode.layout();

      const newId = textNode.id;
      ctx.store.addNode({ id: newId, type: 'text', ref: textNode });
      ctx.bus.emit({ t: 'SELECT', ids: [newId] });
      ctx.guides.draw([]);

      const destroy$ = new Subject<void>();
      this.drag.bind(textNode, destroy$, {
        cfg: ctx.cfg,
        store: ctx.store,
        guides: ctx.guides,
        world: ctx.world,
        app: ctx.app,
        bus: ctx.bus,
        utils: ctx.utils,
        overlay: ctx.overlay,
      });

      // Double-click to edit in an overlay textarea
      ctx.utils
        .fromPixi<FederatedPointerEvent>(textNode, 'pointertap')
        .pipe(filter((evt) => evt.detail >= 2))
        .subscribe(() => ctx.overlay.attachTextarea(textNode));
    });

    // APPLY_STYLE to selected nodes (Text/Brush/Shapes; supports groups)
    ctx.bus.commands$.pipe(filter((command) => command.t === 'APPLY_STYLE')).subscribe((cmd) => {
      const patch = (cmd as Extract<EditorCommand, { t: 'APPLY_STYLE' }>).patch;
      const selectedIds = ctx.store.snapshot((s) => s.selectedIds);
      const nodeMap = ctx.store.snapshot((s) => s.nodes);

      const applyPatchToNode = (node: NodeBase) => {
        if (node instanceof TextNode) {
          if (patch.font) node.style.font = patch.font;
          if (patch.weight) node.style.weight = patch.weight as UiTextStyles['weight'];
          if (typeof patch.min === 'number') node.style.min = patch.min;
          if (typeof patch.max === 'number') node.style.max = patch.max;
          if (patch.align) node.style.align = patch.align as Align;
          if (typeof patch.lineHeight === 'number') node.style.lineHeight = patch.lineHeight;
          if (patch.list != null) node.style.list = !!patch.list;
          if (patch.colorHex) {
            node.style.color = ctx.utils.colorToNumber(patch.colorHex);
            node.style.colorHex = patch.colorHex;
          }
          node.requestFit();
          node.drawHandles();
        } else if (node instanceof BrushNode) {
          const brushColor = patch.colorHex ? ctx.utils.colorToNumber(patch.colorHex) : node.stroke;
          const strokeWidth = typeof patch.strokeWidth === 'number' ? patch.strokeWidth : node.strokeWidth;
          node.setStyle(brushColor, strokeWidth);
        } else if (node instanceof ShapeNode) {
          if (patch.colorHex) {
            node.stroke = ctx.utils.colorToNumber(patch.colorHex);
          }
          // Line thickness is locked at 1px for now; ignore strokeWidth for lines
          node.applyBoxSize(node.w, node.h);
        } else if (node instanceof GroupNode) {
          // Recursively apply to children
          for (const child of node.children) {
            if (child instanceof NodeBase) applyPatchToNode(child);
          }
        }
      };

      for (const id of selectedIds) {
        const state = nodeMap[id];
        if (state?.ref) applyPatchToNode(state.ref as NodeBase);
      }
      ctx.store.setUI(patch);
    });
  }
}
