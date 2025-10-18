import { InjectionToken } from '@angular/core';
import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import { EditorStore } from './services/editor-store.service';
import { CommandBusService } from './services/command-bus.service';
import { EditorUtilsService } from './services/editor-utils.service';
import { EditorConfig } from './types';
import { OverlayService } from './services/overlay.service';
import { GuideLayer } from './guides';

export interface EditorPlugin {
  id: string;
  init(ctx: EditorContext): void;
  dispose?(): void;
}

export interface EditorContext {
  app: Application;
  world: Container & { app: Application };
  store: EditorStore;
  bus: CommandBusService;
  utils: EditorUtilsService;
  overlay: OverlayService;
  guides: GuideLayer;
  cfg: EditorConfig;
}

export const EDITOR_PLUGINS = new InjectionToken<EditorPlugin[]>('EDITOR_PLUGINS');

let ID_SEQUENCE = 1;
export function generateId(prefix: string) { return `${prefix}_${ID_SEQUENCE++}`; }

/**
 * Name of a resize/rotate handle drawn around a node's bounding box.
 *
 * The eight resize handles are named using compass directions to indicate their position
 * relative to the box: nw (north‑west, top‑left), n (north, top‑center), ne (north‑east, top‑right),
 * e (east, middle‑right), se (south‑east, bottom‑right), s (south, bottom‑center),
 * sw (south‑west, bottom‑left), w (west, middle‑left).
 *
 * A special handle 'rot' (rotation) is positioned above the top‑center and is used to rotate the node.
 */
export type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

/**
 * Pixi.js Graphics supports arbitrary fields; we use these optional fields on
 * handle graphics to convey intended cursor and a back‑reference label.
 */
type Cursorable = { cursor?: string; label?: HandleName };

/**
 * Base class for all editable nodes placed on the editor stage.
 *
 * Responsibilities:
 * - Store common geometry (x, y, w, h) and selection state.
 * - Draw selection frame and interactive resize/rotate handles.
 * - Provide an abstract applyBoxSize that derived nodes implement to react to size changes.
 */
export abstract class NodeBase extends Container {
  selected = false;
  id = generateId('node');
  w = 400;
  h = 200;
  padding = 12;
  snap = true;

  frame = new Graphics();
  handlesContainer = new Container();
  handleRects: Partial<Record<HandleName, Graphics>> = {};

  constructor() {
    super();
    this.addChild(this.frame, this.handlesContainer);
    this.eventMode = 'static';
    this.handlesContainer.visible = false;
  }

  setSelected(on: boolean) {
    if (this.destroyed) return;
    this.selected = on;
    if (this.handlesContainer && !this.handlesContainer.destroyed) {
      this.handlesContainer.visible = !!on;
    }
    this.drawFrame();
    if (this.children?.length && this.handlesContainer && !this.handlesContainer.destroyed) this.addChild(this.handlesContainer);
  }

  /**
   * Apply a new bounding box to the node. Implementations should update their
   * internal visuals to reflect the new width/height (and optionally request relayout).
   */
  abstract applyBoxSize(w: number, h: number): void;

  /**
   * Draws the selection frame (focus ring) and expands hitArea to include
   * extra margins for top/side/bottom space reserved for handles and rotation gizmo.
   */
  drawFrame() {
    if (this.destroyed) return;
    const g = this.frame;
    if (!g || g.destroyed || typeof g.clear !== 'function') return;
    g.clear();
    const strokeColor = this.selected ? 0x99ffaa : 0x6b7280;
    const strokeAlpha = this.selected ? 0.9 : 0.5;
    g.roundRect(0, 0, this.w, this.h, 8).stroke({ color: strokeColor, width: 1, alpha: strokeAlpha });
    const marginTop = 40;
    const marginSide = 14;
    const marginBottom = 14;
    this.hitArea = new Rectangle(-marginSide, -marginTop, this.w + marginSide * 2, this.h + marginTop + marginBottom);
  }

  /**
   * Draws or updates resize/rotate handles around the current bounding box.
   *
   * initialize=true will recreate Graphics instances; otherwise only positions/appearance are updated.
   */
  drawHandles(initialize = false) {
    const names: readonly HandleName[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'];
    const positions: Record<HandleName, [number, number]> = {
      nw: [0, 0],
      n: [this.w / 2, 0],
      ne: [this.w, 0],
      e: [this.w, this.h / 2],
      se: [this.w, this.h],
      s: [this.w / 2, this.h],
      sw: [0, this.h],
      w: [0, this.h / 2],
      rot: [this.w / 2, -28],
    };

    if (initialize) {
      this.handlesContainer.removeChildren();
      this.handleRects = {};
    }

    for (const name of names) {
      let g = this.handleRects[name];
      if (!g) {
        g = new Graphics();
        this.handleRects[name] = g;
        this.handlesContainer.addChild(g);
        g.eventMode = 'static';
        g.hitArea = name === 'rot' ? new Rectangle(-12, -12, 24, 24) : new Rectangle(-10, -10, 20, 20);
      }
      g.clear();
      const cg = g as unknown as Cursorable;
      if (name === 'rot') {
        g.moveTo(0, 6).lineTo(0, 16).stroke({ color: 0xeeff99, width: 1 });
        g.circle(0, 0, 6).fill(0xffffff).stroke({ color: 0x99ffaa, width: 1 });
        cg.cursor = 'grab';
      } else {
        g.roundRect(-5, -5, 10, 10, 2).fill(0xffffff).stroke({ color: 0xeeff99, width: 1 });
        cg.cursor =
          name === 'n' || name === 's' ? 'ns-resize' :
          name === 'e' || name === 'w' ? 'ew-resize' :
          name === 'ne' || name === 'sw' ? 'nesw-resize' :
          'nwse-resize';
      }
      const [x, y] = positions[name];
      g.position.set(x, y);
      cg.label = name;
    }
  }
}
