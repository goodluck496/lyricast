
import { BackgroundHostNode, NodeBackgroundManager } from '../mixins/background-manager';
import { Application, Graphics, HTMLText, HTMLTextStyle } from 'pixi.js';
import { normalizeFontWeight } from '../utils/text-utils';
import { NodeBase } from './base.node';
import { DEFAULT_CONFIG, UiTextStyles } from '../types';
import { AssetStorageService, TextFitService } from '../services';

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
  public readonly textDisplay: HTMLText; // <-- Объявить тип без инициализации
  private readonly bgG = new Graphics(); // Keep for solid fill drawing
  private backgroundManager: NodeBackgroundManager; // New manager instance

  constructor(
    private readonly app: Application,
    private readonly fitter: TextFitService,
    private readonly assetStorage: AssetStorageService,
    isCastingMode = false
  ) {
    super(isCastingMode);
    this.textDisplay = new HTMLText({ text: '' }); // <-- Удалить масштабирование
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
        '.pixi-html-text, .pixi-html-text * { margin: 0; white-space: normal !important; word-break: normal !important; overflow-wrap: break-word !important; }',
        ' ul, ol { margin: 0; padding-left: 0; list-style-position: inside; }',
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
        '.pixi-html-text, .pixi-html-text p { margin: 0; white-space: normal; word-break: normal; overflow-wrap: break-word; }',
        '.pixi-html-text ul, .pixi-html-text ol { margin-left: 1.2em; padding-left: 0; list-style-position: inside; }',
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
        '.pixi-html-text, .pixi-html-text p { margin: 0; white-space: normal; word-break: normal; overflow-wrap: break-word; }',
        '.pixi-html-text ul, .pixi-html-text ol { margin-left: 1.2em; padding-left: 0; list-style-position: inside; }',
      ],
    });

    this.updateTextPosition();
  }
}
