import { Injectable } from '@nestjs/common';
import { IPptxExporter } from './pptx-interfaces';
import { SerializedState } from '@lyri-cast/entities';
import PptxGenJS from 'pptxgenjs';
import * as fs from 'node:fs';
import * as path from 'node:path';

@Injectable()
export class PptxExportAdapterService implements IPptxExporter {
  async export(presentationName: string, slides: SerializedState[]): Promise<Buffer> {
    const pptx = new PptxGenJS();
    pptx.title = presentationName;
    pptx.layout = slides[0]?.aspectRatio === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_16x9';

    for (const slideState of slides) {
      const slide = pptx.addSlide();

      const sceneWidth = slideState.sceneBounds?.width && slideState.sceneBounds.width > 0 ? slideState.sceneBounds.width : 1920;
      const sceneHeight = slideState.sceneBounds?.height && slideState.sceneBounds.height > 0 ? slideState.sceneBounds.height : 1080;
      const pptxWidth = 10;
      const pptxHeight = slideState.aspectRatio === '4:3' ? 7.5 : 5.625;

      const pxToInchesX = (px: number) => {
        const val = (px / sceneWidth) * pptxWidth;
        return Number.isNaN(val) ? 0 : val;
      };
      const pxToInchesY = (px: number) => {
        const val = (px / sceneHeight) * pptxHeight;
        return Number.isNaN(val) ? 0 : val;
      };

      for (const node of slideState.nodes) {
        const x = pxToInchesX(node.x);
        const y = pxToInchesY(node.y);
        const w = this.ensurePositiveSize(pxToInchesX(node.width));
        const h = this.ensurePositiveSize(pxToInchesY(node.height));

        if (node.type === 'text') {
          const rawText = this.htmlToPlainText(node.textHtml);
          const color = this.resolveColor(node.style, 'FFFFFF');

          let fontSize = node.actualFontSize || this.resolveNumber(node.style, 'fontSize') || 24;
          fontSize = fontSize * (pptxHeight / sceneHeight) * 72; // rough approximation
          if (Number.isNaN(fontSize) || fontSize <= 0) fontSize = 24;

          const textOptions: PptxGenJS.TextPropsOptions = {
            x, y, w, h,
            fontSize,
            color,
            valign: 'middle',
            align: this.resolveTextAlign(node.style),
            breakLine: false,
          };
          
          if (node.bgFillColor != null) {
            textOptions.fill = { color: this.toHexColor(node.bgFillColor) };
          }

          slide.addText(rawText, textOptions);
        } else if (node.type === 'image') {
          const imagePath = this.resolveImagePath(node.assetId, node.url);

          if (!imagePath) {
            continue;
          }

          try {
            if (this.isImageDataUrl(imagePath)) {
              slide.addImage({ data: imagePath, x, y, w, h });
              continue;
            }

            if (imagePath.startsWith('http')) {
              slide.addImage({ path: imagePath, x, y, w, h });
              continue;
            }

            if (!fs.existsSync(imagePath)) {
              continue;
            }

            const imageBuffer = fs.readFileSync(imagePath);
            const mimeType = this.resolveImageMimeType(imagePath, imageBuffer);
            const base64Data = imageBuffer.toString('base64');
            slide.addImage({ data: `data:${mimeType};base64,${base64Data}`, x, y, w, h });
          } catch (e) {
            console.warn('Failed to add image to pptx', e);
          }
        } else if (node.type === 'shape') {
          let shapeType = pptx.ShapeType.rect;
          if (node.shape === 'ellipse') {
            shapeType = pptx.ShapeType.ellipse;
          } else if (node.shape === 'line') {
            shapeType = pptx.ShapeType.line;
          }
          
          const shapeOpts: PptxGenJS.ShapeProps = { x, y, w, h };
          if (node.fill != null) {
            shapeOpts.fill = { color: this.toHexColor(node.fill) };
          }
          if (node.stroke != null) {
            shapeOpts.line = {
              color: this.toHexColor(node.stroke),
              width: node.lineWidth,
            };
          }
          
          slide.addShape(shapeType, shapeOpts);
        }
      }
    }

    const result = await pptx.write({ outputType: 'nodebuffer' });
    return result as Buffer;
  }

  private ensurePositiveSize(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0.01;
    }

    return value;
  }

  private htmlToPlainText(html: string): string {
    return html
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*p\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, '')
      .trim();
  }

  private resolveColor(style: unknown, fallback: string): string {
    const fill = this.resolveNumber(style, 'fill');
    if (fill != null) {
      return this.toHexColor(fill);
    }

    const color = this.resolveNumber(style, 'color');
    if (color != null) {
      return this.toHexColor(color);
    }

    const colorHex = this.resolveString(style, 'colorHex');
    if (colorHex) {
      return colorHex.replace('#', '').toUpperCase();
    }

    return fallback;
  }

  private resolveTextAlign(style: unknown): PptxGenJS.HAlign {
    const align = this.resolveString(style, 'align');
    if (align === 'left' || align === 'right' || align === 'center' || align === 'justify') {
      return align;
    }

    return 'center';
  }

  private resolveNumber(source: unknown, key: string): number | undefined {
    if (!this.isRecord(source)) {
      return undefined;
    }

    const value = source[key];
    return typeof value === 'number' ? value : undefined;
  }

  private resolveString(source: unknown, key: string): string | undefined {
    if (!this.isRecord(source)) {
      return undefined;
    }

    const value = source[key];
    return typeof value === 'string' ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toHexColor(value: number): string {
    return value.toString(16).padStart(6, '0').slice(-6).toUpperCase();
  }

  private resolveImagePath(assetId?: string, url?: string): string {
    if (assetId) {
      const assetsEnvPath = process.env['USER_ASSETS_PATH'] || process.env['USER_DATA_PATH'] || '';
      const assetsPath = process.env['USER_ASSETS_PATH'] ? assetsEnvPath : path.join(assetsEnvPath, 'user-assets');
      return path.join(assetsPath, assetId);
    }

    if (url && !url.startsWith('blob:')) {
      return url;
    }

    return '';
  }

  private isImageDataUrl(value: string): boolean {
    return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
  }

  private resolveImageMimeType(filePath: string, data: Buffer): string {
    if (data[0] === 0xff && data[1] === 0xd8) {
      return 'image/jpeg';
    }

    if (
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    ) {
      return 'image/png';
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      return 'image/jpeg';
    }

    return 'image/png';
  }
}
