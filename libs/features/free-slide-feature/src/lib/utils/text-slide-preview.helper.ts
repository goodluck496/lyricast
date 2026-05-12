import {
  SerializedImageNode,
  SerializedState,
  SerializedTextNode,
} from '@lyri-cast/entities';

type PreviewCanvasOptions = {
  width?: number;
  height?: number;
  jpegQuality?: number;
  normalizeLargeSceneFont?: boolean;
};

type PreviewAssetLoader = (assetId: string) => Promise<Blob | undefined>;

/**
 * Shared canvas renderer for free-slide previews.
 *
 * It is used where Pixi is not available yet or should not be involved:
 * slide thumbnails, the right casting preview fallback, and PPTX import previews.
 * The helper keeps text sizing, line breaks, colors, and legacy 1920x1080 imports
 * consistent across those UI surfaces.
 */
export class TextSlidePreviewHelper {
  private static readonly defaultPreviewWidth = 480;
  private static readonly defaultPreviewHeight = 270;
  private static readonly normalizedSceneWidth = 768;

  static createCanvasFromContent(
    content: string,
    options: PreviewCanvasOptions = {}
  ): HTMLCanvasElement | undefined {
    if (!content) {
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(content);
      if (!this.isSerializedState(parsed)) {
        return undefined;
      }

      return this.createCanvas(parsed, options);
    } catch {
      return undefined;
    }
  }

  static dataUrlFromContent(
    content: string,
    options: PreviewCanvasOptions = {}
  ): string | undefined {
    const canvas = this.createCanvasFromContent(content, options);
    return canvas?.toDataURL('image/jpeg', options.jpegQuality ?? 0.86);
  }

  static createCanvas(
    state: SerializedState,
    options: PreviewCanvasOptions = {}
  ): HTMLCanvasElement | undefined {
    const textNode = state.nodes.find(
      (node): node is SerializedTextNode => node.type === 'text'
    );
    if (!textNode || state.nodes.some((node) => node.type !== 'text')) {
      return undefined;
    }

    if (textNode.bgAssetId) {
      return undefined;
    }

    const previewContext = this.createPreviewContext(state, options);
    if (!previewContext) {
      return undefined;
    }

    this.fillCanvas(previewContext.ctx, previewContext.canvas, textNode.bgFillColor ?? 0x000000);
    this.renderTextNode(previewContext, textNode);

    return previewContext.canvas;
  }

  static async createCanvasWithAssets(
    state: SerializedState,
    loadAsset: PreviewAssetLoader,
    options: PreviewCanvasOptions = {}
  ): Promise<HTMLCanvasElement | undefined> {
    const previewContext = this.createPreviewContext(state, options);
    if (!previewContext) {
      return undefined;
    }

    this.fillCanvas(previewContext.ctx, previewContext.canvas, 0x000000);

    for (const node of state.nodes) {
      if (node.type === 'image') {
        await this.renderImageNode(previewContext, node, loadAsset);
      } else if (node.type === 'text') {
        this.renderTextNode(previewContext, node);
      }
    }

    return previewContext.canvas;
  }

  private static isSerializedState(value: unknown): value is SerializedState {
    return this.isRecord(value) && Array.isArray(value['nodes']);
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private static createPreviewContext(
    state: SerializedState,
    options: PreviewCanvasOptions
  ): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    sceneWidth: number;
    scaleX: number;
    scaleY: number;
    fontScale: number;
  } | undefined {
    const sceneWidth = state.sceneBounds?.width ?? this.normalizedSceneWidth;
    const sceneHeight = state.sceneBounds?.height ?? 432;
    const canvas = document.createElement('canvas');
    canvas.width = options.width ?? this.defaultPreviewWidth;
    canvas.height = options.height ?? this.defaultPreviewHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }

    const scaleX = canvas.width / sceneWidth;
    const scaleY = canvas.height / sceneHeight;
    const scale = Math.min(scaleX, scaleY);
    const fontScale =
      options.normalizeLargeSceneFont && sceneWidth > 1000
        ? canvas.width / this.normalizedSceneWidth
        : scale;

    return {
      canvas,
      ctx,
      sceneWidth,
      scaleX,
      scaleY,
      fontScale,
    };
  }

  private static fillCanvas(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    color: number
  ): void {
    ctx.fillStyle = this.toCanvasColor(color);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private static renderTextNode(
    previewContext: {
      ctx: CanvasRenderingContext2D;
      scaleX: number;
      scaleY: number;
      fontScale: number;
    },
    textNode: SerializedTextNode
  ): void {
    const ctx = previewContext.ctx;
    const scale = Math.min(previewContext.scaleX, previewContext.scaleY);
    const padding = (textNode.padding ?? 40) * scale;
    const x = textNode.x * previewContext.scaleX;
    const y = textNode.y * previewContext.scaleY;
    const width = textNode.width * previewContext.scaleX;
    const height = textNode.height * previewContext.scaleY;
    const fontSize =
      (textNode.actualFontSize ?? this.readStyleNumber(textNode, 'max') ?? 68) *
      previewContext.fontScale;
    const lineHeight =
      fontSize * (this.readStyleNumber(textNode, 'lineHeight') ?? 1.15);
    const lines = this.wrapText(
      ctx,
      this.htmlToText(textNode.textHtml),
      Math.max(4, width - padding * 2),
      fontSize,
      this.readStyleString(textNode, 'font')
    );

    if (typeof textNode.bgFillColor === 'number') {
      ctx.fillStyle = this.toCanvasColor(textNode.bgFillColor);
      ctx.fillRect(x, y, width, height);
    }

    ctx.font = this.toCanvasFont(fontSize, this.readStyleString(textNode, 'font'));
    ctx.fillStyle = this.toCanvasColor(
      this.readStyleNumber(textNode, 'color') ?? 0xffffff
    );
    ctx.shadowColor = this.toCanvasColor(
      this.readStyleNumber(textNode, 'shadowColor') ?? 0x000000
    );
    const shadowSize = (this.readStyleNumber(textNode, 'shadowSize') ?? 0) * scale;
    ctx.shadowOffsetX = shadowSize;
    ctx.shadowOffsetY = shadowSize;
    ctx.shadowBlur = (this.readStyleNumber(textNode, 'shadowBlur') ?? 0) * scale;

    const align = this.readStyleString(textNode, 'align');
    ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
    ctx.textBaseline = 'alphabetic';

    const innerWidth = Math.max(4, width - padding * 2);
    const innerHeight = Math.max(4, height - padding * 2);
    const totalHeight = lines.length * lineHeight;
    const textX =
      ctx.textAlign === 'left'
        ? x + padding
        : ctx.textAlign === 'right'
          ? x + padding + innerWidth
          : x + padding + innerWidth / 2;
    let textY =
      y + padding + Math.max(0, (innerHeight - totalHeight) / 2) + fontSize;

    for (const line of lines) {
      ctx.fillText(line, textX, Math.round(textY));
      textY += lineHeight;
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
  }

  private static async renderImageNode(
    previewContext: {
      ctx: CanvasRenderingContext2D;
      scaleX: number;
      scaleY: number;
    },
    imageNode: SerializedImageNode,
    loadAsset: PreviewAssetLoader
  ): Promise<void> {
    if (!imageNode.assetId) {
      return;
    }

    const blob = await loadAsset(imageNode.assetId);
    if (!blob) {
      return;
    }

    const bitmap = await createImageBitmap(blob);
    try {
      previewContext.ctx.drawImage(
        bitmap,
        imageNode.x * previewContext.scaleX,
        imageNode.y * previewContext.scaleY,
        imageNode.width * previewContext.scaleX,
        imageNode.height * previewContext.scaleY
      );
    } finally {
      bitmap.close();
    }
  }

  private static readStyleNumber(
    textNode: SerializedTextNode,
    key: string
  ): number | undefined {
    const style = this.isRecord(textNode.style) ? textNode.style : undefined;
    const value = style?.[key];
    return typeof value === 'number' ? value : undefined;
  }

  private static readStyleString(
    textNode: SerializedTextNode,
    key: string
  ): string | undefined {
    const style = this.isRecord(textNode.style) ? textNode.style : undefined;
    const value = style?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  private static wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    fontSize: number,
    fontFamily = 'Segoe UI'
  ): string[] {
    ctx.font = this.toCanvasFont(fontSize, fontFamily);
    const lines: string[] = [];

    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = '';

      for (const word of words) {
        const nextLine = `${line} ${word}`.trim();
        if (line && ctx.measureText(nextLine).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = nextLine;
        }
      }

      lines.push(line);
    }

    return lines.length > 0 ? lines : [''];
  }

  private static htmlToText(html: string): string {
    return html
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }

  private static toCanvasFont(fontSize: number, fontFamily = 'Segoe UI'): string {
    const family = fontFamily
      .split(',')
      .map((part) => this.toCanvasFontFamilyPart(part.trim()))
      .filter(Boolean)
      .join(', ');

    return `${fontSize}px ${family}, Arial, sans-serif`;
  }

  private static toCanvasFontFamilyPart(fontFamily: string): string {
    if (!fontFamily) {
      return '';
    }

    if (
      (fontFamily.startsWith('"') && fontFamily.endsWith('"')) ||
      (fontFamily.startsWith("'") && fontFamily.endsWith("'"))
    ) {
      return fontFamily;
    }

    return /\s/.test(fontFamily)
      ? `"${fontFamily.replace(/"/g, '\\"')}"`
      : fontFamily;
  }

  private static toCanvasColor(color: number): string {
    return `#${color.toString(16).padStart(6, '0').slice(-6)}`;
  }
}
