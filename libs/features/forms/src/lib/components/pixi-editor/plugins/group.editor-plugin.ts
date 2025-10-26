import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin, NodeBase } from '../core';
import { filter, Subject } from 'rxjs';
import { EditorCommand } from '../services/command-bus.service';
import { DragResizeService } from '../services/drag-resize.service';
import { GroupNode, IframeNode, TextNode, ImageNode, VideoNode, ShapeNode, BrushNode } from '../nodes';
import { NodeState } from '../services/editor-store.service';

function getNodeType(node: NodeBase): NodeState['type'] {
  if (node instanceof TextNode) return 'text';
  if (node instanceof ImageNode) return 'image';
  if (node instanceof VideoNode) return 'video';
  if (node instanceof IframeNode) return 'iframe';
  if (node instanceof ShapeNode) return 'shape';
  if (node instanceof GroupNode) return 'group';
  if (node instanceof BrushNode) return 'brush';
  return 'shape';
}

/**
 * GroupingPlugin groups multiple selected nodes into a GroupNode and ungroups back.
 *
 * - GROUP: wraps two or more nodes into a single GroupNode and disables child interactivity.
 * - UNGROUP: moves children back to the world and restores interactivity; rebinds if needed.
 */
@Injectable()
export class GroupingPlugin implements EditorPlugin {
  id = 'grouping';
  constructor(private readonly drag: DragResizeService) {}
  init(ctx: EditorContext): void {
    // GROUP
    ctx.bus.commands$.pipe(filter((command) => command.t === 'GROUP')).subscribe((cmd) => {
      const groupCmd = cmd as Extract<EditorCommand, { t: 'GROUP' }>;
      const ids = groupCmd.ids?.length
        ? groupCmd.ids
        : ctx.store.snapshot((s) => s.selectedIds);
      if (ids.length < 2) return;
      const nodesMap = ctx.store.snapshot((s) => s.nodes);
      const nodes = ids
        .map((id) => nodesMap[id]?.ref as NodeBase)
        .filter((node): node is NodeBase => !!node);
      if (!nodes.length) return;

      // Compute enclosing bounds in world space
      const minX = Math.min(...nodes.map((n) => n.x));
      const minY = Math.min(...nodes.map((n) => n.y));
      const maxX = Math.max(...nodes.map((n) => n.x + n.w));
      const maxY = Math.max(...nodes.map((n) => n.y + n.h));

      // Create group and position at top-left of bounds
      const group = new GroupNode();
      group.x = minX;
      group.y = minY;
      group.applyBoxSize(maxX - minX, maxY - minY);
      ctx.world.addChild(group);

      // Reparent selected nodes into the group and convert positions to group-local
      for (const childNode of nodes) {
        // Remove from world if present, then add under group
        try {
          ctx.world.removeChild(childNode);
        } catch {
          /* ignore */
        }
        childNode.x = childNode.x - group.x;
        childNode.y = childNode.y - group.y;
        group.addChild(childNode);
        // Disable child interactivity while grouped; only the group is interactive
        childNode.eventMode = 'none';
        // Deselect individual nodes; only group will be selected
        if (typeof (childNode as unknown as { setSelected?: (s: boolean) => void }).setSelected === 'function') {
          (childNode as unknown as { setSelected: (s: boolean) => void }).setSelected(false);
        }
      }

      // Register the group node in the store and select it
      const groupId = group.id;
      ctx.store.addNode({ id: groupId, type: 'group', ref: group });
      // Bind drag/resize to the group so it moves/resizes as a single block
      this.drag.bind(group, new Subject<void>(), {
        cfg: ctx.cfg,
        store: ctx.store,
        guides: ctx.guides,
        world: ctx.world,
        app: ctx.app,
        bus: ctx.bus,
        utils: ctx.utils,
        overlay: ctx.overlay,
      });
      ctx.bus.emit({ t: 'SELECT', ids: [groupId] });
    });

    // UNGROUP
    ctx.bus.commands$
      .pipe(filter((command) => command.t === 'UNGROUP'))
      .subscribe((cmd) => {
        const ungroupCmd = cmd as Extract<EditorCommand, { t: 'UNGROUP' }>;
        const maybeId = ungroupCmd.id ?? ctx.store.snapshot((s) => s.selectedIds)[0];
        if (!maybeId) return;
        const group = ctx.store.snapshot((s) => s.nodes)[maybeId]?.ref as GroupNode;
        if (!(group instanceof GroupNode)) return;

        // Reparent children back to world coordinates
        const childrenRefs = group.children.filter(
          (c): c is NodeBase => c instanceof NodeBase
        );
        const childIds = childrenRefs.map((c) => c.id);
        for (const child of childrenRefs) {
          try {
            group.removeChild(child);
          } catch {
            /* ignore */
          }
          child.x = child.x + group.x;
          child.y = child.y + group.y;
          ctx.world.addChild(child);
          // Restore interactivity that was disabled during grouping
          child.eventMode = 'static';
          // If this child is a clone (e.g., came from duplicating a group), it may not be registered/bound yet
          const exists = ctx.store.snapshot((s) => s.nodes)[child.id];
          if (!exists) {
            const type = getNodeType(child);
            ctx.store.addNode({
              id: child.id,
              type,
              ref: child,
            });
            this.drag.bind(child, new Subject<void>(), {
              cfg: ctx.cfg,
              store: ctx.store,
              guides: ctx.guides,
              world: ctx.world,
              app: ctx.app,
              bus: ctx.bus,
              utils: ctx.utils,
              overlay: ctx.overlay,
            });
            // Ensure iframe overlay can be positioned later if needed
            if (child instanceof IframeNode) {
              ctx.overlay.attachIframe(child);
              ctx.overlay.setIframeInteractive(false);
            }
          }
        }

        // Remove the group container and select former children
        ctx.world.removeChild(group);
        ctx.store.removeNode(maybeId);
        ctx.bus.emit({ t: 'SELECT', ids: childIds });
      });
  }
}
