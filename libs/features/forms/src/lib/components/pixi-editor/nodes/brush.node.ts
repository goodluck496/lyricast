

/* ========================= section: brush node ============================ */
import { NodeBase } from './base.node';
import {
  BackgroundHostNode,
  NodeBackgroundManager,
} from '../mixins/background-manager';
import { Container, Graphics, Point } from 'pixi.js';
import { AssetStorageService } from '../services';

export class BrushNode extends NodeBase implements BackgroundHostNode {
  // Implement BackgroundHostNode
  readonly type = 'brush' as const;
  stroke = 0xffffff;
  strokeWidth = 4;
  path: Point[] = [];
  bgAssetId?: string;
  shape?: 'rect' | 'ellipse' | 'line';
  textDisplay?: Container;
  private g = new Graphics();
  private backgroundManager: NodeBackgroundManager; // New manager instance

  constructor(private readonly assetStorage: AssetStorageService, isCastingMode = false) {
    super(isCastingMode);
    this.backgroundManager = new NodeBackgroundManager(
      this,
      this.assetStorage,
      () => this.g, // Primary graphics for z-ordering
      () => this.redraw()
    );
    this.addChild(this.g);
    this.addChild(this.handlesContainer);
    this.drawHandles(true);
  }

  setStyle(color: number, width: number) {
    this.stroke = color;
    this.strokeWidth = Math.max(1, width | 0);
    this.redraw();
  }

  setPath(points: Point[]) {
    this.path = points.map((p) => new Point(p.x, p.y));
    this.backgroundManager.updateBackgroundLayout(); // Delegate to manager
    this.redraw();
  }

  /** Проверяет, является ли путь замкнутым (расстояние между первой и последней точкой < 10px) */
  isPathClosed(): boolean {
    if (this.path.length < 3) return false;
    const first = this.path[0];
    const last = this.path[this.path.length - 1];
    const dist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
    return dist < 10;
  }

  /** Установить фоновое изображение (работает только для замкнутых путей) */
  async setBackground(urlOrAssetId: string) {
    await this.backgroundManager.setBackground(urlOrAssetId);
  }

  /** Очистить фоновое изображение */
  clearBackground() {
    this.backgroundManager.clearBackground();
  }

  // Removed private updateBackgroundLayout()

  private redraw() {
    const graphics = this.g;
    graphics.clear();
    if (!this.path.length) return;
    graphics.moveTo(this.path[0].x, this.path[0].y);
    for (const point of this.path) graphics.lineTo(point.x, point.y);
    graphics.stroke({
      color: this.stroke,
      width: this.strokeWidth,
      cap: 'round' as const,
      join: 'round' as const,
    });
  }

  applyBoxSize(w: number, h: number): void {
    // scale path to new box size
    const scaleX = this.w > 0 ? w / this.w : 1;
    const scaleY = this.h > 0 ? h / this.h : 1;
    this.w = w;
    this.h = h;
    this.path = this.path.map(
      (point) => new Point(point.x * scaleX, point.y * scaleY)
    );
    this.backgroundManager.updateBackgroundLayout(); // Delegate to manager
    this.redraw();
    this.drawHandles();
  }
}

export class BrushLayer extends Container {
  private points: { x: number; y: number }[] = [];
  private g = new Graphics();

  constructor() {
    super();
    this.addChild(this.g);
  }
  start(x: number, y: number) {
    this.points = [{ x, y }];
    this.redraw();
  }
  add(x: number, y: number) {
    this.points.push({ x, y });
    this.redraw();
  }
  end() {
    /* no-op for now */
  }

  private redraw() {
    const g = this.g;
    g.clear();
    if (!this.points.length) return;
    g.moveTo(this.points[0].x, this.points[0].y);
    for (const p of this.points) g.lineTo(p.x, p.y);
    g.stroke({ color: 0xffffff, width: 2 });
  }
}
