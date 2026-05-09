import { Injectable } from '@nestjs/common';
import { IPptxImporter } from './pptx-interfaces';
import { SerializedImageNode, SerializedState, SerializedTextNode } from '@lyri-cast/entities';
import JSZip from 'jszip';
import * as xml2js from 'xml2js';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

type XmlRecord = Record<string, unknown>;

type ImportedTextBox = {
  textHtml: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  colorHex: string;
  fontSize?: number;
};

type TextColor = {
  color: number;
  colorHex: string;
};

type SlideRelationship = {
  id: string;
  target: string;
  type: string;
};

@Injectable()
export class PptxImportAdapterService implements IPptxImporter {
  async import(fileBuffer: Buffer): Promise<SerializedState[]> {
    try {
      const zip = await JSZip.loadAsync(fileBuffer);
      const slidePaths = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => this.extractSlideNumber(a) - this.extractSlideNumber(b));

      const sceneWidth = 768;
      const sceneHeight = 432;

      const slides = await Promise.all(
        slidePaths.map(async (slidePath) => {
          const slideFile = zip.file(slidePath);
          const slideXml = await slideFile?.async('text');
          const state: SerializedState = {
            nodes: [],
            zoom: 1,
            aspectRatio: '16:9',
            sceneBounds: { width: sceneWidth, height: sceneHeight },
          };

          if (!slideXml) {
            return state;
          }

          const parsedSlide: unknown = await xml2js.parseStringPromise(slideXml, {
            explicitArray: false,
            attrkey: '$',
          });
          const relationships = await this.extractSlideRelationships(zip, slidePath);
          const imageNodes = await this.extractImageNodes(
            zip,
            parsedSlide,
            relationships,
            sceneWidth,
            sceneHeight
          );
          const textBoxes = this.extractTextBoxes(parsedSlide, sceneWidth, sceneHeight);
          const slideTextHtml = this.extractSlideTextHtmlFromXml(slideXml);
          if (slideTextHtml) {
            const firstTextBox = textBoxes[0];
            if (firstTextBox) {
              firstTextBox.textHtml = slideTextHtml;
            } else {
              textBoxes.push({
                textHtml: slideTextHtml,
                x: 0,
                y: 0,
                width: sceneWidth,
                height: sceneHeight,
                color: 0xffff00,
                colorHex: '#FFFF00',
              });
            }
          }
          const textNode = this.createFullSlideTextNode(
            textBoxes,
            sceneWidth,
            sceneHeight,
            imageNodes.length === 0 ? 0x000000 : null
          );

          state.nodes = textNode ? [...imageNodes, textNode] : imageNodes;

          return state;
        })
      );

      return slides.length > 0 ? slides : [this.createEmptySlide(sceneWidth, sceneHeight)];
    } catch (e) {
      console.error('Failed to parse PPTX file', e);
      throw new Error('PPTX parsing failed');
    }
  }

  private createFullSlideTextNode(
    textBoxes: ImportedTextBox[],
    sceneWidth: number,
    sceneHeight: number,
    bgFillColor: number | null
  ): SerializedTextNode | null {
    const nonEmptyBoxes = textBoxes.filter((box) => box.textHtml.trim().length > 0);
    if (nonEmptyBoxes.length === 0) {
      return null;
    }

    const colorSource = nonEmptyBoxes.find((box) => box.colorHex !== '#FFFF00') ?? nonEmptyBoxes[0];
    const fontSource = nonEmptyBoxes
      .map((box) => box.fontSize)
      .filter((fontSize): fontSize is number => typeof fontSize === 'number')
      .sort((a, b) => b - a)[0];
    const textHtml = nonEmptyBoxes.map((box) => box.textHtml).join('<br />');

    return {
      id: randomUUID(),
      type: 'text',
      x: 0,
      y: 0,
      width: sceneWidth,
      height: sceneHeight,
      rotation: 0,
      alpha: 1,
      textHtml,
      actualFontSize: fontSource,
      style: {
        font: 'Segoe UI',
        weight: 'regular',
        align: 'center',
        valign: 'middle',
        lineHeight: 1.15,
        min: 16,
        max: fontSource ?? 68,
        color: colorSource.color,
        colorHex: colorSource.colorHex,
      },
      padding: 40,
      bgFillColor,
    };
  }

  private async extractSlideRelationships(
    zip: JSZip,
    slidePath: string
  ): Promise<Map<string, SlideRelationship>> {
    const slideFileName = slidePath.split('/').pop();
    if (!slideFileName) {
      return new Map();
    }

    const relsPath = `ppt/slides/_rels/${slideFileName}.rels`;
    const relsXml = await zip.file(relsPath)?.async('text');
    if (!relsXml) {
      return new Map();
    }

    const parsedRels: unknown = await xml2js.parseStringPromise(relsXml, {
      explicitArray: false,
      attrkey: '$',
    });
    const relationshipRecords = this.findRecordsByLocalName(parsedRels, 'Relationship');
    const relationships = new Map<string, SlideRelationship>();
    const slideDir = path.posix.dirname(slidePath);

    for (const relationship of relationshipRecords) {
      const id = this.readAttrString(relationship, 'Id');
      const type = this.readAttrString(relationship, 'Type');
      const target = this.readAttrString(relationship, 'Target');
      if (!id || !type || !target || target.startsWith('http')) {
        continue;
      }

      const normalizedTarget = target.startsWith('/')
        ? path.posix.normalize(target.slice(1))
        : path.posix.normalize(path.posix.join(slideDir, target));

      relationships.set(id, {
        id,
        type,
        target: normalizedTarget,
      });
    }

    return relationships;
  }

  private async extractImageNodes(
    zip: JSZip,
    parsedSlide: unknown,
    relationships: Map<string, SlideRelationship>,
    sceneWidth: number,
    sceneHeight: number
  ): Promise<SerializedImageNode[]> {
    const picRecords = this.findRecordsByLocalName(parsedSlide, 'pic');
    const nodes: SerializedImageNode[] = [];

    for (const pic of picRecords) {
      const blip = this.findFirstRecordByLocalName(pic, 'blip');
      const relationshipId = this.readAttrStringByLocalName(blip, 'embed');
      if (!relationshipId) {
        continue;
      }

      const relationship = relationships.get(relationshipId);
      if (!relationship || !relationship.type.endsWith('/image')) {
        continue;
      }

      const mediaFile = zip.file(relationship.target);
      const mediaBuffer = await mediaFile?.async('nodebuffer');
      if (!mediaBuffer) {
        continue;
      }

      const mimeType = this.resolveImageMimeType(relationship.target, mediaBuffer);
      if (!mimeType) {
        continue;
      }

      const transform = this.findFirstRecordByLocalName(pic, 'xfrm');
      const off = transform ? this.findFirstRecordByLocalName(transform, 'off') : null;
      const ext = transform ? this.findFirstRecordByLocalName(transform, 'ext') : null;
      const emuSlideWidth = 9144000;
      const emuSlideHeight = 5143500;
      const x = this.emuToPx(this.readAttrNumber(off, 'x'), emuSlideWidth, sceneWidth);
      const y = this.emuToPx(this.readAttrNumber(off, 'y'), emuSlideHeight, sceneHeight);
      const width = this.emuToPx(this.readAttrNumber(ext, 'cx'), emuSlideWidth, sceneWidth);
      const height = this.emuToPx(this.readAttrNumber(ext, 'cy'), emuSlideHeight, sceneHeight);
      const bounds = this.normalizeImageBounds(
        {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          width: width > 0 ? width : sceneWidth,
          height: height > 0 ? height : sceneHeight,
        },
        sceneWidth,
        sceneHeight
      );

      nodes.push({
        id: randomUUID(),
        type: 'image',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        alpha: 1,
        imageFit: 'stretch',
        url: `data:${mimeType};base64,${mediaBuffer.toString('base64')}`,
      });
    }

    return nodes;
  }

  private normalizeImageBounds(
    bounds: { x: number; y: number; width: number; height: number },
    sceneWidth: number,
    sceneHeight: number
  ): { x: number; y: number; width: number; height: number } {
    const left = bounds.x;
    const top = bounds.y;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const coversScene =
      left <= sceneWidth * 0.05 &&
      top <= sceneHeight * 0.05 &&
      right >= sceneWidth * 0.95 &&
      bottom >= sceneHeight * 0.95;

    if (!coversScene) {
      return bounds;
    }

    return {
      x: 0,
      y: 0,
      width: sceneWidth,
      height: sceneHeight,
    };
  }

  private extractSlideNumber(path: string): number {
    const match = /slide(\d+)\.xml$/i.exec(path);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  private extractSlideTextHtmlFromXml(slideXml: string): string {
    const paragraphs: string[] = [];
    const paragraphRegex = /<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/gi;
    let paragraphMatch: RegExpExecArray | null;

    while ((paragraphMatch = paragraphRegex.exec(slideXml)) !== null) {
      const paragraphXml = paragraphMatch[1];
      const lineParts: string[] = [];
      const tokenRegex = /<a:br\s*\/>|<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi;
      let tokenMatch: RegExpExecArray | null;

      while ((tokenMatch = tokenRegex.exec(paragraphXml)) !== null) {
        if (tokenMatch[0].startsWith('<a:br')) {
          lineParts.push('\n');
        } else {
          lineParts.push(this.decodeXmlText(tokenMatch[1] ?? ''));
        }
      }

      const paragraphText = lineParts.join('').trim();
      if (paragraphText) {
        paragraphs.push(this.escapeHtml(paragraphText).replace(/\n/g, '<br />'));
      }
    }

    return paragraphs.join('<br />');
  }

  private createEmptySlide(sceneWidth: number, sceneHeight: number): SerializedState {
    return {
      nodes: [],
      zoom: 1,
      aspectRatio: '16:9',
      sceneBounds: { width: sceneWidth, height: sceneHeight },
    };
  }

  private extractTextBoxes(
    parsedSlide: unknown,
    sceneWidth: number,
    sceneHeight: number
  ): ImportedTextBox[] {
    const shapeRecords = this.findRecordsByLocalName(parsedSlide, 'sp');
    const boxes = shapeRecords
      .map((shape, index) => this.shapeToTextBox(shape, index, sceneWidth, sceneHeight))
      .filter((box): box is ImportedTextBox => box !== null);

    if (boxes.length > 0) {
      return boxes;
    }

    const fallbackText = this.collectText(parsedSlide).join('').trim();
    return fallbackText
      ? [{
          textHtml: this.escapeHtml(fallbackText),
          x: 0,
          y: 0,
          width: sceneWidth,
          height: sceneHeight,
          color: 0xffff00,
          colorHex: '#FFFF00',
        }]
      : [];
  }

  private shapeToTextBox(
    shape: XmlRecord,
    index: number,
    sceneWidth: number,
    sceneHeight: number
  ): ImportedTextBox | null {
    const textHtml = this.extractShapeTextHtml(shape);
    if (!textHtml) {
      return null;
    }
    const textColor = this.extractTextColor(shape);
    const fontSize = this.extractTextFontSize(shape);

    const transform = this.findFirstRecordByLocalName(shape, 'xfrm');
    const off = transform ? this.findFirstRecordByLocalName(transform, 'off') : null;
    const ext = transform ? this.findFirstRecordByLocalName(transform, 'ext') : null;
    const emuSlideWidth = 9144000;
    const emuSlideHeight = 5143500;
    const x = this.emuToPx(this.readAttrNumber(off, 'x'), emuSlideWidth, sceneWidth);
    const y = this.emuToPx(this.readAttrNumber(off, 'y'), emuSlideHeight, sceneHeight);
    const width = this.emuToPx(this.readAttrNumber(ext, 'cx'), emuSlideWidth, sceneWidth);
    const height = this.emuToPx(this.readAttrNumber(ext, 'cy'), emuSlideHeight, sceneHeight);

    return {
      textHtml,
      x: Number.isFinite(x) ? x : 80,
      y: Number.isFinite(y) ? y : 80 + index * 120,
      width: width > 0 ? width : sceneWidth - 160,
      height: height > 0 ? height : 120,
      color: textColor.color,
      colorHex: textColor.colorHex,
      fontSize,
    };
  }

  private extractShapeTextHtml(shape: XmlRecord): string {
    const textBody = this.findFirstRecordByLocalName(shape, 'txBody') ?? shape;
    const paragraphs = this.getDirectChildrenByLocalName(textBody, 'p')
      .map((paragraph) => this.extractParagraphText(paragraph).trim())
      .filter((line) => line.length > 0);

    if (paragraphs.length > 0) {
      return paragraphs
        .map((line) => this.escapeHtml(line).replace(/\n/g, '<br />'))
        .join('<br />');
    }

    const text = this.collectText(shape).join('').trim();
    return text ? this.escapeHtml(text) : '';
  }

  private extractParagraphText(paragraph: XmlRecord): string {
    const parts: string[] = [];

    for (const [key, child] of Object.entries(paragraph)) {
      const localName = this.localName(key);
      if (localName === 'br') {
        parts.push('\n');
      } else if ((localName === 'r' || localName === 'fld') && this.isRecord(child)) {
        parts.push(this.collectText(child).join(''));
      } else if ((localName === 'r' || localName === 'fld') && Array.isArray(child)) {
        parts.push(
          ...child
            .filter((item): item is XmlRecord => this.isRecord(item))
            .map((item) => this.collectText(item).join(''))
        );
      }
    }

    if (parts.length > 0) {
      return parts.join('');
    }

    this.walk(paragraph, (key, child) => {
      if (this.localName(key) === 't' && typeof child === 'string') {
        parts.push(child);
      }
    });

    return parts.join('');
  }

  private getDirectChildrenByLocalName(record: XmlRecord, localName: string): XmlRecord[] {
    const children: XmlRecord[] = [];

    for (const [key, value] of Object.entries(record)) {
      if (this.localName(key) !== localName) {
        continue;
      }

      if (this.isRecord(value)) {
        children.push(value);
      } else if (Array.isArray(value)) {
        children.push(...value.filter((item): item is XmlRecord => this.isRecord(item)));
      }
    }

    return children;
  }

  private extractTextColor(shape: XmlRecord): TextColor {
    const textBody = this.findFirstRecordByLocalName(shape, 'txBody') ?? shape;
    const runProperties = this.findRecordsByLocalName(textBody, 'rPr');

    for (const runProperty of runProperties) {
      const color = this.extractColorFromRecord(runProperty);
      if (color) {
        return color;
      }
    }

    const paragraphProperties = this.findRecordsByLocalName(textBody, 'pPr');
    for (const paragraphProperty of paragraphProperties) {
      const color = this.extractColorFromRecord(paragraphProperty);
      if (color) {
        return color;
      }
    }

    return { color: 0xffff00, colorHex: '#FFFF00' };
  }

  private extractTextFontSize(shape: XmlRecord): number | undefined {
    const textBody = this.findFirstRecordByLocalName(shape, 'txBody') ?? shape;
    const runProperties = this.findRecordsByLocalName(textBody, 'rPr');

    for (const runProperty of runProperties) {
      const fontSize = this.extractFontSizeFromRecord(runProperty);
      if (fontSize) {
        return fontSize;
      }
    }

    const endRunProperties = this.findRecordsByLocalName(textBody, 'endParaRPr');
    for (const endRunProperty of endRunProperties) {
      const fontSize = this.extractFontSizeFromRecord(endRunProperty);
      if (fontSize) {
        return fontSize;
      }
    }

    return undefined;
  }

  private extractFontSizeFromRecord(record: XmlRecord): number | undefined {
    const size = this.readAttrNumber(record, 'sz');
    if (!Number.isFinite(size) || size <= 0) {
      return undefined;
    }

    const pointSize = size / 100;
    const editorFontSize = pointSize * (68 / 60);
    return Math.min(240, Math.max(16, Math.round(editorFontSize)));
  }

  private extractColorFromRecord(record: XmlRecord): TextColor | null {
    const srgbColor = this.findFirstRecordByLocalName(record, 'srgbClr');
    const srgbValue = this.readAttrString(srgbColor, 'val');
    if (srgbValue) {
      return this.hexToTextColor(srgbValue);
    }

    const schemeColor = this.findFirstRecordByLocalName(record, 'schemeClr');
    const schemeValue = this.readAttrString(schemeColor, 'val');
    return schemeValue ? this.schemeColorToTextColor(schemeValue) : null;
  }

  private schemeColorToTextColor(value: string): TextColor {
    const schemeColors: Record<string, string> = {
      tx1: '000000',
      tx2: '1F1F1F',
      bg1: 'FFFFFF',
      bg2: 'F2F2F2',
      accent1: '4472C4',
      accent2: 'ED7D31',
      accent3: 'A5A5A5',
      accent4: 'FFC000',
      accent5: '5B9BD5',
      accent6: '70AD47',
      hlink: '0563C1',
      folHlink: '954F72',
    };

    return this.hexToTextColor(schemeColors[value] ?? 'FFFF00');
  }

  private hexToTextColor(value: string): TextColor {
    const hex = value.replace('#', '').slice(0, 6).padStart(6, '0').toUpperCase();
    return {
      color: Number.parseInt(hex, 16),
      colorHex: `#${hex}`,
    };
  }

  private findRecordsByLocalName(value: unknown, localName: string): XmlRecord[] {
    const found: XmlRecord[] = [];
    this.walk(value, (key, child) => {
      if (this.localName(key) !== localName) {
        return;
      }

      if (Array.isArray(child)) {
        found.push(...child.filter((item): item is XmlRecord => this.isRecord(item)));
        return;
      }

      if (this.isRecord(child)) {
        found.push(child);
      }
    });
    return found;
  }

  private findFirstRecordByLocalName(value: unknown, localName: string): XmlRecord | null {
    const records = this.findRecordsByLocalName(value, localName);
    return records[0] ?? null;
  }

  private collectText(value: unknown): string[] {
    const text: string[] = [];
    this.walk(value, (key, child) => {
      if (this.localName(key) === 't' && typeof child === 'string') {
        text.push(child);
      }
    });
    return text;
  }

  private walk(value: unknown, visit: (key: string, child: unknown) => void): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.walk(item, visit);
      }
      return;
    }

    if (!this.isRecord(value)) {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      visit(key, child);
      this.walk(child, visit);
    }
  }

  private readAttrNumber(record: XmlRecord | null, key: string): number {
    if (!record) {
      return Number.NaN;
    }

    const attrs = record['$'];
    if (!this.isRecord(attrs)) {
      return Number.NaN;
    }

    const value = attrs[key];
    if (typeof value === 'number') {
      return value;
    }

    return typeof value === 'string' ? Number(value) : Number.NaN;
  }

  private readAttrString(record: XmlRecord | null, key: string): string | null {
    if (!record) {
      return null;
    }

    const attrs = record['$'];
    if (!this.isRecord(attrs)) {
      return null;
    }

    const value = attrs[key];
    return typeof value === 'string' ? value : null;
  }

  private readAttrStringByLocalName(record: XmlRecord | null, localName: string): string | null {
    if (!record) {
      return null;
    }

    const attrs = record['$'];
    if (!this.isRecord(attrs)) {
      return null;
    }

    for (const [key, value] of Object.entries(attrs)) {
      if (this.localName(key) === localName && typeof value === 'string') {
        return value;
      }
    }

    return null;
  }

  private resolveImageMimeType(filePath: string, data: Buffer): string | null {
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

    if (ext === '.png') {
      return 'image/png';
    }

    return null;
  }

  private emuToPx(value: number, emuMax: number, pxMax: number): number {
    return (value / emuMax) * pxMax;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private decodeXmlText(text: string): string {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  private localName(key: string): string {
    const parts = key.split(':');
    return parts[parts.length - 1];
  }

  private isRecord(value: unknown): value is XmlRecord {
    return typeof value === 'object' && value !== null;
  }
}
