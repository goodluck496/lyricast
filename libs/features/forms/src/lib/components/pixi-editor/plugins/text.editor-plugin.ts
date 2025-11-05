import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin,  } from '../core';
import { filter, takeUntil } from 'rxjs/operators';
import { EditorCommand } from '../services/command-bus.service';
import {
  AddNodeCommand,
  ChangeBackgroundCommand,
} from '../services/history-commands';
import { Subject } from 'rxjs';
import { FederatedPointerEvent } from 'pixi.js';
import { TextFitService } from '../services/text-fit.service';
import { DragResizeService } from '../services/drag-resize.service';
import { BrushNode, GroupNode, ShapeNode, TextNode, NodeBase } from '../nodes';
import { Align, UiTextStyles } from '../types';
import { AssetStorageService } from '../services/asset-storage.service';

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
  private destroy$ = new Subject<void>();

  constructor(private readonly fitter: TextFitService, private readonly drag: DragResizeService, private readonly assetStorage: AssetStorageService) {}

  /** Initialize subscriptions for text-related editor commands. */
  init(ctx: EditorContext): void {
    // ADD_TEXT: create and select a new text node
    ctx.bus.commands$.pipe(filter((command) => command.t === 'ADD_TEXT'), takeUntil(this.destroy$)).subscribe((cmd) => {
      const addText = cmd as Extract<EditorCommand, { t: 'ADD_TEXT' }>;
      const textNode = new TextNode(ctx.app, this.fitter, this.assetStorage);
      textNode.x = addText.x ?? 80;
      textNode.y = addText.y ?? 80;

      // Применяем стили и текст ДО вызова applyBoxSize и layout
      if (addText.options?.style) {
        textNode.style = { ...addText.options.style };
        // Передаем actualFontSize для восстановления
        textNode.style.actualFontSize = addText.options.style.actualFontSize;
      }
      textNode.textHtml = addText.text ?? 'New text';

      if (typeof addText.options?.bgFillColor === 'number') {
        textNode.setBackgroundFill(addText.options.bgFillColor);
      } else if (addText.options?.bgAssetId) {
        // textNode.bgAssetId = addText.options.bgAssetId;
        void textNode.setBackground(addText.options.bgAssetId);
      }

      // Теперь вызываем applyBoxSize, который использует actualFontSize, если он есть
      textNode.applyBoxSize(addText.options?.width ?? 600, addText.options?.height ?? 240);

      // layout() вызываем только если узел создается с нуля, а не восстанавливается
      if (!addText.options?.style?.actualFontSize) {
        void textNode.layout();
      }

      const destroy$ = new Subject<void>();
      const nodeState = { id: textNode.id, type: 'text' as const, ref: textNode, destroy$ };

      // Выполняем команду добавления через историю
      const command = new AddNodeCommand(nodeState, ctx.world, ctx.store);
      ctx.history.execute(command);

      ctx.bus.emit({ t: 'SELECT', ids: [textNode.id] });
      ctx.guides.draw([]);

      this.drag.bind(textNode, destroy$, {
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

      // Double-click to edit in an overlay textarea
      ctx.utils
        .fromPixi<FederatedPointerEvent>(textNode, 'pointertap')
        .pipe(filter((evt) => evt.detail >= 2), takeUntil(this.destroy$))
        .subscribe(() => ctx.overlay.attachTextarea(textNode));
    });

    // APPLY_STYLE to selected nodes (Text/Brush/Shapes; supports groups)
    ctx.bus.commands$.pipe(filter((command) => command.t === 'APPLY_STYLE'), takeUntil(this.destroy$)).subscribe((cmd) => {
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
          // if (patch.list != null) node.style.list = !!patch.list;
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

    // Text background commands
    const applyToSelection = (fn: (node: TextNode) => void) => {
      const selectedIds = ctx.store.snapshot((s) => s.selectedIds);
      const nodeMap = ctx.store.snapshot((s) => s.nodes);
      const visit = (n: NodeBase) => {
        if (n instanceof TextNode) fn(n);
        else if (n instanceof GroupNode) {
          for (const ch of n.children) if (ch instanceof NodeBase) visit(ch);
        }
      };
      for (const id of selectedIds) {
        const n = nodeMap[id]?.ref as TextNode | undefined ;
        if (n) {
          console.log(`[TextPlugin] applyToSelection: Found node ${id}, type: ${n['type'] }`, n);
          visit(n);
        }
      }
    };

    ctx.bus.commands$.pipe(filter((c) => c.t === 'SET_TEXT_BACKGROUND'), takeUntil(this.destroy$)).subscribe(async (cmd) => {
      const setBgCmd = cmd as Extract<EditorCommand, { t: 'SET_TEXT_BACKGROUND' }>;
      const source = setBgCmd.url || setBgCmd.assetId;
      if (!source) return;

      applyToSelection(async (textNode) => {
        const newAssetId = await this.assetStorage.ensureAssetIsLocal(source);

        if (newAssetId) {
          const command = new ChangeBackgroundCommand(
            textNode,
            textNode.backgroundImageUrl, // old assetId
            newAssetId                 // new assetId
          );
          ctx.history.execute(command);
        }
      });
    });
    ctx.bus.commands$.pipe(filter((c) => c.t === 'CLEAR_TEXT_BACKGROUND'), takeUntil(this.destroy$)).subscribe(() => {
      applyToSelection((t) => t.clearBackground());
    });
    ctx.bus.commands$.pipe(filter((c) => c.t === 'SET_TEXT_BG_COLOR'), takeUntil(this.destroy$)).subscribe((cmd) => {
      const color = (cmd as Extract<EditorCommand, { t: 'SET_TEXT_BG_COLOR' }>).color >>> 0;
      applyToSelection((t) => t.setBackgroundFill(color));
    });
  }

  dispose(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

}
