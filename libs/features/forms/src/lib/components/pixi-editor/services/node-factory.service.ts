import { inject, Injectable } from '@angular/core';
import { Application, Point } from 'pixi.js';
import {
  BrushNode,
  GroupNode,
  IframeNode,
  ImageNode,
  ShapeNode,
  TextNode,
  VideoNode,
} from '../nodes';
import { TextFitService } from './text-fit.service';
import { AssetStorageService } from './asset-storage.service';
import { NodeBase } from '../core';

@Injectable()
export class NodeFactoryService {
  private readonly textFit = inject(TextFitService);
  private readonly assetStorage = inject(AssetStorageService);

  // This will be provided by the editor component
  public app!: Application;

  /**
   * Определяет тип NodeBase.
   * @param n
   */
  getNodeType(
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

  /**
   * Клонирует NodeBase и его специфичные свойства.
   * @param src
   */
  cloneNode(src: NodeBase): NodeBase | null {
    if (src instanceof TextNode) {
      const n = new TextNode(this.app, this.textFit, this.assetStorage);
      n.textHtml = src.textHtml;
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
      const n = new ShapeNode(src.shape, this.assetStorage);
      n.fill = src.fill;
      n.stroke = src.stroke;
      n.lineWidth = src.lineWidth;
      n.applyBoxSize(src.w, src.h);
      return n;
    }
    if (src instanceof BrushNode) {
      const n = new BrushNode(this.assetStorage);
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
}
