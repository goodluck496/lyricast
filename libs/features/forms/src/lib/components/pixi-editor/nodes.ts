import {
  Application,
  Container,
  DestroyOptions,
  Graphics,
  HTMLText,
  HTMLTextStyle,
  Point,
  Sprite,
  Texture,
} from 'pixi.js';
import { DEFAULT_CONFIG, UiTextStyles } from './types';
import { TextFitService } from './services/text-fit.service';
import { NodeBase } from './core';
import { AssetStorageService } from './services/asset-storage.service';
import { loadTextureRobust } from './utils/texture-loader';
import { normalizeFontWeight } from './utils/text-utils';

// Normalize font weight into a safe string literal that PixiJS expects
/**
 * Editable text node that auto-fits text into its bounding box using TextFitService.
 * Supports list style, alignment, font family/weight, color and dynamic line height.
 */
import {
  BackgroundHostNode,
  NodeBackgroundManager,
} from './mixins/background-manager'; // Add manager imports

export class TextNode extends NodeBase implements BackgroundHostNode {
  readonly type = 'text' as const;

  textHtml = 'Double-click to edit';
  style: UiTextStyles = {
    font: DEFAULT_CONFIG.defaults.family,
    weight: DEFAULT_CONFIG.defaults.weight,
    align: DEFAULT_CONFIG.defaults.align,
    valign: 'middle',
    lineHeight: DEFAULT_CONFIG.defaults.lineHeight,
    min: DEFAULT_CONFIG.defaults.textMin,
    max: DEFAULT_CONFIG.defaults.textMax,
    color: 0xffffff,
    colorHex: '#ffffff',
    actualFontSize: 32,
  };

  private lastCalculatedFontSize = 32;
  /** Exposes the most recently computed font size for external consumers (e.g., overlays). */
  get currentFontSize(): number {
    return this.lastCalculatedFontSize;
  }

  /** Геттеры для сериализации */
  get backgroundColor(): number | null {
    return this.backgroundManager.bgFillColor;
  }

  get backgroundImageUrl(): string | undefined {
    return this.backgroundManager.bgAssetId;
  }

  private fitScheduled = false;
  public readonly textDisplay = new HTMLText({ text: '' }); // Make public for BackgroundHostNode
  private readonly bgG = new Graphics(); // Keep for solid fill drawing
  bgAssetId?: string; // наверно можно удалить
  private backgroundManager: NodeBackgroundManager; // New manager instance

  constructor(
    private readonly app: Application,
    private readonly fitter: TextFitService,
    private readonly assetStorage: AssetStorageService
  ) {
    super();
    this.backgroundManager = new NodeBackgroundManager(
      this,
      this.assetStorage,
      () => this.textDisplay, // Primary graphics for z-ordering
      () => this.redrawBackground() // Callback for host to redraw its solid background
    );
    // Rendering order: background (solid/image) -> text -> handles
    this.addChild(this.bgG);
    this.addChild(this.textDisplay);
    this.addChild(this.handlesContainer);
    this.drawFrame();
    this.drawHandles(true);
  }

  applyBoxSize(w: number, h: number): void {
    const prevW = this.w;
    const prevH = this.h;

    const minSize = this.style.min + this.padding * 2;
    this.w = Math.max(minSize, w);
    this.h = Math.max(minSize, h);

    this.drawFrame();
    this.redrawBackground(); // Ensure solid background is redrawn on resize
    this.backgroundManager.updateBackgroundLayout(); // Delegate to manager
    this.drawHandles();

    // Check if this is a restoration call by looking for a special property.
    const restoredFontSize = this.style.actualFontSize;
    if (restoredFontSize) {
      this.applyFixedSize(restoredFontSize);
      delete this.style.actualFontSize; // Consume the property to avoid re-triggering
      return;
    }

    // If there's no size change, do nothing.
    if (this.w === prevW && this.h === prevH) {
      return;
    }

    // For user-driven resizes, decide whether to reflow or refit.
    // ONLY if we are making the box narrower AND not shorter, do we try to reflow first.
    if (this.w < prevW && this.h >= prevH) {
      this.requestReflowOrFit();
    } else {
      // In all other cases (growing, shrinking height, complex changes), find the new optimal font size.
      this.requestFit();
    }
  }

  /**
   * Applies a specific font size and lays out the text, bypassing the fit algorithm.
   * Used for restoring a node from a serialized state.
   */
  applyFixedSize(size: number) {
    this.lastCalculatedFontSize = size;
    this.textDisplay.text = this.textHtml;

    this.textDisplay.style = new HTMLTextStyle({
      fontFamily: this.style.font,
      fontWeight: normalizeFontWeight(this.style.weight),
      align: this.style.align,
      wordWrap: true,
      breakWords: false,
      whiteSpace: 'normal',
      fill: this.style.color,
      lineHeight: size * this.style.lineHeight,
      fontSize: size,
      wordWrapWidth: Math.max(4, this.w - this.padding * 2),
      cssOverrides: [
        'p { margin: 0; white-space: normal; word-break: normal; overflow-wrap: break-word; }',
        'ul, ol { margin: 0; padding-left: 70px; list-style-position: outside; }',
      ],
    });

    this.updateTextPosition();
  }

  /** Set solid background color behind text */
  setBackgroundFill(color: number | null) {
    this.backgroundManager.setBackgroundFill(color);
  }

  /** Apply an image background (URL/blob/data). */
  async setBackground(urlOrAssetId: string) {
    await this.backgroundManager.setBackground(urlOrAssetId);
  }

  /** Remove image background */
  clearBackground() {
    this.backgroundManager.clearBackground();
  }

  // Removed private updateBackgroundLayout()

  private redrawBackground() {
    // Solid fill
    this.bgG.clear();
    if (this.backgroundManager.bgFillColor != null) {
      this.bgG
        .roundRect(0, 0, this.w, this.h, 6)
        .fill(this.backgroundManager.bgFillColor);
    }
  }

  /**
   * Schedule a layout pass on the next animation frame. Multiple calls within a frame coalesce.
   * This method always re-calculates the optimal font size.
   */
  requestFit() {
    if (this.fitScheduled) return;
    this.fitScheduled = true;
    requestAnimationFrame(() => {
      this.fitScheduled = false;
      void this.layout();
    });
  }

  private reflowOrFitScheduled = false;

  /**
   * Schedules a check to see if the text can fit with the current font size after a resize.
   * If it can't, it falls back to running a full layout to find a new optimal font size.
   */
  public requestReflowOrFit() {
    if (this.reflowOrFitScheduled) return;
    this.reflowOrFitScheduled = true;
    requestAnimationFrame(() => {
      this.reflowOrFitScheduled = false;
      void this.reflowOrFit();
    });
  }

  /**
   * First, attempts to reflow the text with the current font size into the new box dimensions.
   * If the text overflows, it triggers a full `layout()` pass to find a new, smaller font size.
   */
  private async reflowOrFit() {
    // 1. Try to apply current font size with new width.
    this.textDisplay.text = this.textHtml;
    this.textDisplay.style = new HTMLTextStyle({
      fontFamily: this.style.font,
      fontWeight: normalizeFontWeight(this.style.weight),
      align: this.style.align,
      wordWrap: true,
      breakWords: false,
      whiteSpace: 'normal',
      fill: this.style.color,
      fontSize: this.lastCalculatedFontSize,
      lineHeight: this.lastCalculatedFontSize * this.style.lineHeight,
      wordWrapWidth: Math.max(4, this.w - this.padding * 2),
      cssOverrides: [
        'p { margin: 0; white-space: normal; word-break: normal; overflow-wrap: break-word; }',
        'ul, ol { margin: 0; padding-left: 70px; list-style-position: outside; }',
      ],
    });

    // Give Pixi a frame to update the text's metrics
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );

    const innerH = Math.max(4, this.h - this.padding * 2);
    const fitMargin = DEFAULT_CONFIG.defaults.fitMargin;

    // 2. Check if it fits vertically.
    if (this.textDisplay.height <= innerH - fitMargin) {
      // It fits! Just update the position and we're done.
      this.updateTextPosition();
    } else {
      // 3. It doesn't fit. Fall back to the original layout logic to find a new font size.
      await this.layout();
    }
  }

  /**
   * Sets the position of the inner textDisplay object based on the current alignment and box size.
   */
  private updateTextPosition() {
    const anchorX =
      this.style.align === 'center'
        ? 0.5
        : this.style.align === 'right'
        ? 1
        : 0;

    const valign = this.style.valign || 'top';
    const anchorY = valign === 'middle' ? 0.5 : valign === 'bottom' ? 1 : 0;

    this.textDisplay.anchor.set(anchorX, anchorY);

    const innerW = Math.max(4, this.w - this.padding * 2);
    const innerH = Math.max(4, this.h - this.padding * 2);

    const x = this.padding + innerW * anchorX;
    const y = this.padding + innerH * anchorY;

    this.textDisplay.position.set(Math.round(x), Math.round(y));
  }

  /**
   * Perform text layout and font size fitting for the current content and box size.
   * Uses TextFitService.fitBinary to compute an optimal font size, then positions the Pixi Text.
   */
  async layout() {
    this.textDisplay.text = this.textHtml;

    const size = await this.fitter.fitBinary({
      app: this.app,
      text: this.textHtml,
      boxW: this.w,
      boxH: this.h,
      padding: this.padding,
      baseStyle: { fill: this.style.color },
      min: this.style.min,
      max: this.style.max,
      step: DEFAULT_CONFIG.defaults.fitStep,
      fitMargin: DEFAULT_CONFIG.defaults.fitMargin,
      family: this.style.font,
      weight: this.style.weight,
      align: this.style.align,
      lineHeight: this.style.lineHeight,
      hint: this.lastCalculatedFontSize,
      window: DEFAULT_CONFIG.defaults.fitWindow,
      deadbandSteps: DEFAULT_CONFIG.defaults.deadbandSteps,
    });

    this.lastCalculatedFontSize = size;

    this.textDisplay.style = new HTMLTextStyle({
      fontFamily: this.style.font,
      fontWeight: normalizeFontWeight(this.style.weight),
      align: this.style.align,
      wordWrap: true,
      breakWords: false,
      whiteSpace: 'normal',
      fill: this.style.color,
      lineHeight: size * this.style.lineHeight,
      fontSize: size,
      wordWrapWidth: Math.max(4, this.w - this.padding * 2),
      cssOverrides: [
        'p { margin: 0; white-space: normal; }',
        'ul, ol { margin: 0; padding-left: 70px; list-style-position: outside; }',
      ],
    });

    this.updateTextPosition();
  }
}

// Robust texture loader utilities

export class ImageNode extends NodeBase {
  public sprite: Sprite;
  public assetId?: string; // For locally stored assets
  public url?: string; // For external URLs

  get imageUrl(): string | undefined {
    // For serialization, we prioritize assetId, otherwise use url
    return this.assetId || this.url;
  }

  constructor(initialSource?: string) {
    super();
    this.sprite = new Sprite(Texture.WHITE);
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite);
    this.addChild(this.handlesContainer);
    this.drawHandles(true);

    if (initialSource) {
      // Determine if initialSource is an assetId or a URL
      if (
        initialSource.startsWith('http:') ||
        initialSource.startsWith('https:') ||
        initialSource.startsWith('data:')
      ) {
        this.url = initialSource;
      } else {
        this.assetId = initialSource;
      }
      void this.setImage(initialSource);
    }
  }

  async setImage(source: string) {
    try {
      const texture = await loadTextureRobust(source);
      this.sprite.texture = texture;
      this.sprite.width = texture.width;
      this.sprite.height = texture.height;
      this.applyBoxSize(texture.width, texture.height);
    } catch (e) {
      console.error('Failed to load image:', source, e);
      // Fallback to a placeholder or clear the image
      this.sprite.texture = Texture.WHITE;
      this.sprite.width = 100;
      this.sprite.height = 100;
      this.applyBoxSize(100, 100);
    }
  }

  override destroy(options?: DestroyOptions | boolean): void {
    this.sprite.destroy(options);
    super.destroy(options);
  }

  applyBoxSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawFrame();
    this.drawHandles();
    if (this.sprite.texture) {
      const { width, height } = this.sprite.texture;
      const scale = Math.min(this.w / width, this.h / height);
      this.sprite.position.set(this.w / 2, this.h / 2);
      this.sprite.scale.set(scale);
    }
  }
}

export class VideoNode extends NodeBase {
  public sprite: Sprite;
  public assetId?: string; // For locally stored assets
  public url = ''; // For external URLs

  get videoUrl(): string {
    // For serialization, we prioritize assetId, otherwise use url
    return this.assetId || this.url;
  }

  constructor(initialSource?: string) {
    super();
    this.sprite = new Sprite(Texture.WHITE);
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite);
    this.addChild(this.handlesContainer);
    this.drawHandles(true);

    if (initialSource) {
      // Determine if initialSource is an assetId or a URL
      if (
        initialSource.startsWith('http:') ||
        initialSource.startsWith('https:') ||
        initialSource.startsWith('data:')
      ) {
        this.url = initialSource;
      } else {
        this.assetId = initialSource;
      }
      void this.setVideo(initialSource);
    }
  }

  async setVideo(source: string) {
    try {
      const texture = await loadTextureRobust(source);
      this.sprite.texture = texture;
      this.sprite.width = texture.width;
      this.sprite.height = texture.height;
      this.applyBoxSize(texture.width, texture.height);
    } catch (e) {
      console.error('Failed to load video:', source, e);
      // Fallback to a placeholder or clear the video
      this.sprite.texture = Texture.WHITE;
      this.sprite.width = 100;
      this.sprite.height = 100;
      this.applyBoxSize(100, 100);
    }
  }

  applyBoxSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawFrame();
    this.drawHandles();
    if (this.sprite.texture) {
      const { width, height } = this.sprite.texture;
      const scale = Math.min(this.w / width, this.h / height);
      this.sprite.position.set(this.w / 2, this.h / 2);
      this.sprite.scale.set(scale);
    }
  }

  override destroy(options?: DestroyOptions | boolean): void {
    this.sprite.destroy(options);
    super.destroy(options);
  }
}

/** IframeNode is rendered via DOM overlay (not inside Pixi). */
export class IframeNode extends NodeBase {
  readonly type = 'iframe' as const;
  url = 'about:blank';

  constructor(url?: string) {
    super();
    if (url) this.url = url;
    this.drawFrame();
    this.drawHandles(true);
  }

  applyBoxSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawFrame();
    this.drawHandles();
  }
}

/**
 * Primitive shape node capable of rendering rectangle, ellipse or 1px line.
 * Supports fill color, stroke color and stroke width.
 */
export class ShapeNode extends NodeBase implements BackgroundHostNode {
  readonly type = 'shape' as const;
  shape: 'rect' | 'ellipse' | 'line' = 'rect';
  stroke = 0xffffff;
  fill = 0x000000;
  bgAssetId = '';
  lineWidth = 2;
  private shapeG = new Graphics();
  private backgroundManager: NodeBackgroundManager; // New manager instance

  constructor(
    kind: 'rect' | 'ellipse' | 'line' = 'rect',
    private readonly assetStorage: AssetStorageService
  ) {
    super();
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

/* ========================= section: brush node ============================ */
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

  constructor(private readonly assetStorage: AssetStorageService) {
    super();
    this.backgroundManager = new NodeBackgroundManager(
      this,
      this.assetStorage,
      () => this.g, // Primary graphics for z-ordering
      () => this.redraw() // Callback for host to redraw its solid background
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
