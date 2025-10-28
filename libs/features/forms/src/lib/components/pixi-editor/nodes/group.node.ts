import { NodeBase } from './base.node';
import { TextNode } from './text.node';

export class GroupNode extends NodeBase {
  readonly type = 'group' as const;
  constructor() {
    super();
    this.drawHandles(true);
  }
  get childrenIds(): string[] {
    return this.children
      .filter((c): c is NodeBase => c instanceof NodeBase)
      .map((c) => (c as NodeBase).id);
  }
  applyBoxSize(w: number, h: number): void {
    const prevW = this.w || 1;
    const prevH = this.h || 1;
    this.w = w;
    this.h = h;
    const sx = prevW > 0 ? w / prevW : 1;
    const sy = prevH > 0 ? h / prevH : 1;
    // Scale children proportionally
    for (const ch of this.children) {
      if (ch instanceof NodeBase) {
        ch.x *= sx;
        ch.y *= sy;
        const newW = Math.max(1, ch.w * sx);
        const newH = Math.max(1, ch.h * sy);
        ch.applyBoxSize(newW, newH);
        if (ch instanceof TextNode) ch.requestReflowOrFit();
      }
    }
    this.drawFrame();
    this.drawHandles();
  }
}
