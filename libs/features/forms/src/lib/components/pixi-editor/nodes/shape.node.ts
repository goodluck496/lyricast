import {
  BackgroundHostNode,
  NodeBackgroundManager,
} from '../mixins/background-manager';
import { NodeBase } from './base.node';
import { Graphics } from 'pixi.js';
import { AssetStorageService } from '../services';

/**
 * Primitive shape node capable of rendering rectangle, ellipse or 1px line.
 * Supports fill color, stroke color and stroke width.
 */
export class ShapeNode extends NodeBase implements BackgroundHostNode {
  readonly type = 'shape' as const;
  shape: 'rect' | 'ellipse' | 'line' = 'rect';
  stroke = 0xffffff;
  fill = 0x000000;
  lineWidth = 2;
  private shapeG = new Graphics();
  private backgroundManager: NodeBackgroundManager; // New manager instance

  get bgAssetId(): string | undefined {
    return this.backgroundManager.bgAssetId;
  }

  constructor(
    kind: 'rect' | 'ellipse' | 'line' = 'rect',
    private readonly assetStorage: AssetStorageService,
    isCastingMode = false
  ) {
    super(isCastingMode);
    this.shape = kind;
    this.backgroundManager = new NodeBackgroundManager(
      this,
      this.assetStorage,
      () => this.shapeG, // Primary graphics for z-ordering
      () => this.redraw() // Callback for host to redraw its solid background
    );
    // Insert order: background sprite (if any) -> shape graphics (stroke/fallback fill) -> handles
    // Start with shape graphics
    this.addChild(this.shapeG);
    this.addChild(this.handlesContainer);
    this.redraw();
    this.drawHandles(true);
  }

  /** Set solid fill color for the shape (used when no background image is set). */
  setFillColor(color: number) {
    this.fill = color >>> 0;
    this.backgroundManager.setBackgroundFill(null); // Clear image background if any
    this.redraw();
  }

  /** Apply a background image by URL/data/blob. Only works for rect/ellipse. */
  async setBackground(urlOrAssetId: string) {
    await this.backgroundManager.setBackground(urlOrAssetId);
  }

  /** Remove background image and mask, falling back to solid fill. */
  clearBackground() {
    this.backgroundManager.clearBackground();
  }

  // Removed private updateBackgroundLayout()

  private redraw() {
    const graphics = this.shapeG;
    graphics.clear();
    if (this.shape === 'rect') {
      // If background image exists, skip solid fill and only draw stroke on top
      if (
        this.backgroundManager.bgAssetId == null &&
        this.backgroundManager.bgFillColor == null
      )
        graphics.roundRect(0, 0, this.w, this.h, 6).fill(this.fill);
      graphics
        .roundRect(0, 0, this.w, this.h, 6)
        .stroke({ color: this.stroke, width: this.lineWidth });
    } else if (this.shape === 'ellipse') {
      if (
        this.backgroundManager.bgAssetId == null &&
        this.backgroundManager.bgFillColor == null
      )
        graphics
          .ellipse(this.w / 2, this.h / 2, this.w / 2, this.h / 2)
          .fill(this.fill);
      graphics
        .ellipse(this.w / 2, this.h / 2, this.w / 2, this.h / 2)
        .stroke({ color: this.stroke, width: this.lineWidth });
    } else {
      // Line shape: always render as 1px thick regardless of box height
      const thickness = 1;
      const midY = thickness / 2;
      graphics
        .moveTo(0, midY)
        .lineTo(this.w, midY)
        .stroke({
          color: this.stroke,
          width: thickness,
          cap: 'round' as const,
        });
    }
    this.backgroundManager.updateBackgroundLayout(); // Delegate to manager
  }

  applyBoxSize(w: number, h: number): void {
    this.w = w;
    // For line shape, lock height to 1px regardless of input
    this.h = this.shape === 'line' ? 1 : h;
    this.redraw();
    this.drawHandles();
  }
}
