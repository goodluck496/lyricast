import { Container, Graphics, Sprite } from 'pixi.js';
import { AssetStorageService } from '../services/asset-storage.service';
import { loadTextureRobust } from '../utils/texture-loader';

// Define an interface for the host node that the manager will interact with
export interface BackgroundHostNode {
  type: any;
  w: number;
  h: number;
  addChild(displayObject: Container): Container;
  addChildAt(displayObject: Container, index: number): Container;
  getChildIndex(displayObject: Container): number;
  shape?: 'rect' | 'ellipse' | 'line';
  path?: { x: number; y: number }[]; // For BrushNode
  isPathClosed?: () => boolean; // For BrushNode
  // For TextNode, it needs to know its textDisplay for z-ordering
  textDisplay?: Container;
}

export class NodeBackgroundManager {
  public bgFillColor: number | null = null;
  public bgAssetId?: string;
  private bgSprite?: Sprite;
  private maskG?: Graphics;

  constructor(
    private hostNode: BackgroundHostNode,
    private assetStorage: AssetStorageService,
    private getPrimaryGraphicsForZOrder: () => Container, // e.g., textDisplay for TextNode, shapeG for ShapeNode
    private redrawHostBackground?: () => void // Callback for host node to redraw its own solid background
  ) {}

  private isAssetId(source: string): boolean {
    // Check for SHA-256 hash (64 hex characters)
    return /^[0-9a-fA-F]{64}$/.test(source);
  }

  /** Set solid background color behind text/shape */
  setBackgroundFill(color: number | null) {
    this.bgFillColor = color == null ? null : color >>> 0;
    // Если устанавливаем цвет, очищаем фоновое изображение
    if (this.bgFillColor != null && this.bgSprite) {
      this.bgSprite.destroy();
      this.bgSprite = undefined;
      if (this.maskG) {
        this.maskG.destroy();
        this.maskG = undefined;
      }
    }
    this.bgAssetId = undefined; // Clear asset ID when setting solid fill
    this.redrawHostBackground?.(); // Ask host to redraw its solid background
  }

  /** Apply an image background (URL/blob/data). */
  async setBackground(urlOrAssetId: string) {
    // Specific check for ShapeNode line type
    if (this.hostNode.shape === 'line') return; // not supported for open line
    // Specific check for BrushNode if path is not closed
    if (this.hostNode.isPathClosed && !this.hostNode.isPathClosed()) {
      console.warn('Cannot set background: path is not closed');
      return;
    }

    const oldAssetId = this.bgAssetId;
    let assetIdToLoad: string;

    if (this.isAssetId(urlOrAssetId)) {
      assetIdToLoad = urlOrAssetId;
    } else {
      // It's a direct URL (http, https, data, blob). Import it.
      try {
        assetIdToLoad = await this.assetStorage.importAssetFromUrl(urlOrAssetId);
      } catch (e) {
        console.error(`[NodeBackgroundManager] Failed to import asset from URL: ${urlOrAssetId}`, e);
        return;
      }
    }

    // If the new asset is the same as the old one, do nothing.
    if (assetIdToLoad === oldAssetId) {
      return;
    }

    // Now, we for sure have an asset ID. Let's resolve it to a local URL.
    const resolvedUrl = await this.assetStorage.getAssetObjectURL(assetIdToLoad);
    if (!resolvedUrl) {
      console.warn(
        `[NodeBackgroundManager] Failed to resolve asset ID: ${assetIdToLoad}`
      );
      return;
    }

    try {
      const tex = await loadTextureRobust(resolvedUrl);
      // If we successfully loaded the new texture, we can now update the state.
      this.bgAssetId = assetIdToLoad; // Store the new asset ID for serialization
      this.bgFillColor = null; // Clear any solid fill

      if (!this.bgSprite) {
        this.bgSprite = new Sprite(tex);
        this.bgSprite.anchor.set(0.5);
        const primaryGraphicsIndex = this.hostNode.getChildIndex(
          this.getPrimaryGraphicsForZOrder()
        );
        this.hostNode.addChildAt(
          this.bgSprite,
          Math.max(0, primaryGraphicsIndex)
        );
      } else {
        this.bgSprite.texture = tex;
      }

      if (!this.maskG) {
        this.maskG = new Graphics();
        const primaryGraphicsIndex = this.hostNode.getChildIndex(
          this.getPrimaryGraphicsForZOrder()
        );
        this.hostNode.addChildAt(this.maskG, Math.max(0, primaryGraphicsIndex));
        this.bgSprite.mask = this.maskG;
      }

      this.updateBackgroundLayout();
      this.redrawHostBackground?.(); // Ask host to redraw its solid background (to clear it)

      // Now that the new background is successfully set, delete the old asset.
      if (oldAssetId && oldAssetId !== assetIdToLoad) {
        try {
          await this.assetStorage.deleteAsset(oldAssetId);
        } catch (e) {
          console.warn(`[NodeBackgroundManager] Failed to delete old asset ${oldAssetId}`, e);
        }
      }

    } catch (e) {
      console.warn('Failed to set background:', e);
      // If loading the new texture fails, we do not change bgAssetId, so the old one remains.
    }
  }

  /** Remove image background */
  clearBackground() {
    this.bgAssetId = undefined; // Clear asset ID
    if (this.bgSprite) {
      this.bgSprite.destroy();
      this.bgSprite = undefined;
    }
    if (this.maskG) {
      this.maskG.destroy();
      this.maskG = undefined;
    }
    this.redrawHostBackground?.(); // Ensure solid fill is redrawn if it was active
  }

  /** Update bg sprite scale/position and mask shape to current box. */
  updateBackgroundLayout() {
    if (this.bgSprite) {
      const tex = this.bgSprite.texture;
      const tw = Math.max(1, tex.width);
      const th = Math.max(1, tex.height);

      const scale = Math.max(this.hostNode.w / tw, this.hostNode.h / th); // cover
      this.bgSprite.scale.set(scale);
      this.bgSprite.position.set(this.hostNode.w / 2, this.hostNode.h / 2);
    }
    // (re)draw mask to the shape path
    if (this.maskG) {
      const m = this.maskG;
      m.clear();
      // Handle TextNode mask as a rectangle
      if (this.hostNode.type === 'text') {
        m.roundRect(0, 0, this.hostNode.w, this.hostNode.h, 6).fill(0xffffff);
      } else if (this.hostNode.shape === 'rect') {
        m.roundRect(0, 0, this.hostNode.w, this.hostNode.h, 6).fill(0xffffff);
      } else if (this.hostNode.shape === 'ellipse') {
        m.ellipse(
          this.hostNode.w / 2,
          this.hostNode.h / 2,
          this.hostNode.w / 2,
          this.hostNode.h / 2
        ).fill(0xffffff);
      } else if (this.hostNode.path && this.hostNode.path.length > 0) {
        // For BrushNode
        m.moveTo(this.hostNode.path[0].x, this.hostNode.path[0].y);
        for (const point of this.hostNode.path) {
          m.lineTo(point.x, point.y);
        }
        if (this.hostNode.isPathClosed && this.hostNode.isPathClosed()) {
          m.closePath();
        }
        m.fill(0xffffff);
      }
    }
  }

  // This method is primarily for solid fill, or to ensure z-order
  // The actual drawing of solid fill will be handled by the host node's main graphics
  // if it supports it (e.g., ShapeNode, TextNode with bgG)
  // For TextNode, it needs to redraw its bgG
  // For ShapeNode, it needs to redraw its shapeG
  // For BrushNode, it needs to redraw its g
  // This manager only handles the sprite/mask for image backgrounds
  // The host node is responsible for calling this.updateBackgroundLayout() and its own redraw logic
}
