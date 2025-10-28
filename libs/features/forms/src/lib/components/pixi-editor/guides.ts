import { Application, Container, Graphics } from 'pixi.js';
import { DEFAULT_CONFIG, EditorConfig } from './types';
import { NodeBase } from './nodes';

export type GuideLine = { t: 'v'; x: number } | { t: 'h'; y: number };

export class GuideLayer extends Container {
  private lines = new Graphics();
  enabled = true;
  threshold = DEFAULT_CONFIG.guides.threshold;

  constructor(private readonly world: Container & { app: Application }, private readonly cfg: EditorConfig) {
    super();
    this.addChild(this.lines);
    this.enabled = cfg.guides.enabled;
    this.threshold = cfg.guides.threshold;
  }

  private collect(exclude?: Container) {
    const vx: number[] = [];
    const vy: number[] = [];

    for (const c of this.world.children) {
      if (!(c instanceof NodeBase) || c === exclude) continue;
      vx.push(c.x, c.x + c.w / 2, c.x + c.w);
      vy.push(c.y, c.y + c.h / 2, c.y + c.h);
    }

    const stageW = this.world.app.renderer.width / (this.world.scale.x || 1);
    const stageH = this.world.app.renderer.height / (this.world.scale.y || 1);
    vx.push(stageW / 2);
    vy.push(stageH / 2);

    return { vx, vy };
  }

  snap(exclude: NodeBase, x: number, y: number, w: number, h: number) {
    if (!this.enabled) return { x, y, lines: [] as GuideLine[] };

    const { vx, vy } = this.collect(exclude);
    const lines: GuideLine[] = [];

    // X snapping
    const anchorsX = [x, x + w / 2, x + w];
    let snappedX = x;
    let bestDx = Number.POSITIVE_INFINITY;
    let selX: { gx: number; i: number } | null = null;

    for (const gx of vx) {
      for (let i = 0; i < 3; i++) {
        const d = Math.abs(anchorsX[i] - gx);
        if (d < bestDx && d <= this.threshold) { bestDx = d; selX = { gx, i }; }
      }
    }

    if (selX) {
      const { gx, i } = selX;
      snappedX = [gx, gx - w / 2, gx - w][i];
      lines.push({ t: 'v', x: gx });
    }

    // Y snapping
    const anchorsY = [y, y + h / 2, y + h];
    let snappedY = y;
    let bestDy = Number.POSITIVE_INFINITY;
    let selY: { gy: number; i: number } | null = null;

    for (const gy of vy) {
      for (let i = 0; i < 3; i++) {
        const d = Math.abs(anchorsY[i] - gy);
        if (d < bestDy && d <= this.threshold) { bestDy = d; selY = { gy, i }; }
      }
    }

    if (selY) {
      const { gy, i } = selY;
      snappedY = [gy, gy - h / 2, gy - h][i];
      lines.push({ t: 'h', y: gy });
    }

    return { x: snappedX, y: snappedY, lines };
  }

  draw(lines: GuideLine[]) {
    this.lines.clear();
    if (!this.enabled || !lines.length) return;

    const stageW = this.world.app.renderer.width / (this.world.scale.x || 1);
    const stageH = this.world.app.renderer.height / (this.world.scale.y || 1);
    const color = 0xbfd3ff; // soft blue

    for (const l of lines) {
      if (l.t === 'v') {
        this.lines.moveTo(l.x, 0).lineTo(l.x, stageH).stroke({ color, width: 1, alpha: this.cfg.guides.alpha });
      } else {
        this.lines.moveTo(0, l.y).lineTo(stageW, l.y).stroke({ color, width: 1, alpha: this.cfg.guides.alpha });
      }
    }
  }
}
