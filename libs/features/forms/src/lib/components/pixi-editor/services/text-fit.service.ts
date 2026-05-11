import { inject, Injectable } from '@angular/core';
import { Application, Assets, HTMLText } from 'pixi.js';
import { Align, EDITOR_CONFIG, EditorConfig } from '../types';
import { EditorUtilsService } from './editor-utils.service';
import * as FontFaceObserver from 'fontfaceobserver';

interface CustomFontDefinition {
  url: string;
  format: string;
  mime: string;
  dataUrl?: string;
}

/**
 * Service that computes the best font size to fit a given text inside a box.
 * Extracted from the monolithic component and adapted to use EDITOR_CONFIG via DI.
 */
@Injectable({ providedIn: 'any' })
export class TextFitService {
  private readonly utils = inject(EditorUtilsService);
  private readonly cfg = inject<EditorConfig>(EDITOR_CONFIG);

  private readonly customFonts = new Map<string, CustomFontDefinition>([
    [
      'Font-1',
      {
        url: 'assets/fonts/Cruinn-Regular.ttf',
        format: 'truetype',
        mime: 'font/ttf',
      },
    ],
    [
      'Font-2',
      {
        url: 'assets/fonts/Schist-Regular.ttf',
        format: 'truetype',
        mime: 'font/ttf',
      },
    ],
    [
      'Font-3',
      {
        url: 'assets/fonts/Share-Tech-CYR.otf',
        format: 'opentype',
        mime: 'font/otf',
      },
    ],
    [
      'Font-4',
      {
        url: 'assets/fonts/HQYSaversText.ttf',
        format: 'truetype',
        mime: 'font/ttf',
      },
    ],
    [
      'Font-5',
      {
        url: 'assets/fonts/Entropia-Light.otf',
        format: 'opentype',
        mime: 'font/otf',
      },
    ],
  ]);
  private readonly fontLoadPromises = new Map<string, Promise<void>>();


  async fitBinary(options: {
    app: Application;
    text: string;
    boxW: number;
    boxH: number;
    padding: number;
    baseStyle?: { fill?: number };
    min?: number;
    max?: number;
    step?: number;
    fitMargin?: number;
    family?: string;
    weight?: string;
    align?: Align;
    lineHeight?: number;
    hint?: number;
    window?: number;
    deadbandSteps?: number;
  }): Promise<number> {
    const {
      app,
      text,
      baseStyle,
      min = this.cfg.defaults.textMin,
      max = this.cfg.defaults.textMax,
      step = this.cfg.defaults.fitStep,
      fitMargin = this.cfg.defaults.fitMargin,
      family = this.cfg.defaults.family,
      weight = this.cfg.defaults.weight,
      align = this.cfg.defaults.align,
      lineHeight = this.cfg.defaults.lineHeight,
      hint,
      window = this.cfg.defaults.fitWindow,
      deadbandSteps = this.cfg.defaults.deadbandSteps,
    } = options;

    const innerW = Math.max(4, options.boxW - options.padding * 2);
    const innerH = Math.max(4, options.boxH - options.padding * 2);
    if (innerW <= 6 || innerH <= 6) return min;

    // Normalize font weight into a safe string literal that Pixi expects
    type NumericWeightString =
      | '100'
      | '200'
      | '300'
      | '400'
      | '500'
      | '600'
      | '700'
      | '800'
      | '900';
    type FontWeightKeyword = 'normal' | 'bold' | 'bolder' | 'lighter';
    type FontWeightValue = NumericWeightString | FontWeightKeyword;
    const normalizeFontWeight = (w: string): FontWeightValue => {
      const s = String(w).trim().toLowerCase();
      if (s === 'normal' || s === 'bold' || s === 'bolder' || s === 'lighter')
        return s as FontWeightKeyword;
      const n = Number(s);
      const allowed: NumericWeightString[] = [
        '100',
        '200',
        '300',
        '400',
        '500',
        '600',
        '700',
        '800',
        '900',
      ];
      const nearest = Number.isFinite(n)
        ? (String(
            Math.min(900, Math.max(100, Math.round(n / 100) * 100))
          ) as NumericWeightString)
        : '400';
      return allowed.includes(nearest as NumericWeightString)
        ? (nearest as NumericWeightString)
        : '400';
    };
    const normalizedWeight = normalizeFontWeight(weight);
    await this.ensureFontLoaded(family, normalizedWeight, max);

    const probe = new HTMLText({
      text,
      style: {
        fontFamily: family,
        // Pixi expects TextStyleFontWeight as specific string tokens (or keywords).
        fontWeight: normalizedWeight,
        align,
        wordWrap: true,
        wordWrapWidth: innerW,
        whiteSpace: 'normal',
        breakWords: false,
        fill:
          baseStyle && typeof baseStyle.fill === 'number'
            ? baseStyle.fill
            : this.utils.colorToNumber('#ffffee'),
        cssOverrides: [
          ...this.getFontCssOverrides(family),
          '.pixi-html-text, .pixi-html-text * { margin: 0; white-space: normal !important; word-break: normal !important; overflow-wrap: break-word !important; }',
          '.pixi-html-text ul, .pixi-html-text ol { margin: 0; padding-left: 70px; list-style-position: outside; }',
        ],
      },
    });
    probe.visible = false;
    app.stage.addChild(probe);

    const setStyle = (fs: number) => {
      type MutableTextStyle = {
        fontSize: number;
        lineHeight: number;
        wordWrap: boolean;
        breakWords: boolean;
        whiteSpace: string;
        wordWrapWidth: number;
      };
      const s = probe.style as unknown as MutableTextStyle;
      s.fontSize = fs;
      s.lineHeight = fs * lineHeight;
      s.wordWrap = true;
      s.breakWords = false;
      s.whiteSpace = 'normal';
      s.wordWrapWidth = innerW;
    };

    const rafOnce = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    setStyle(Math.max(min, Math.min(max, hint ?? min)));
    await rafOnce();

    let lo = min;
    let hi = max;

    if (typeof hint === 'number' && !Number.isNaN(hint)) {
      lo = Math.max(min, Math.floor((hint - window) / step) * step);
      hi = Math.min(max, Math.ceil((hint + window) / step) * step);
    }

    let best = lo;
    while (lo <= hi) {
      const mid = Math.round((lo + hi) / 2 / step) * step;
      setStyle(mid);
      // eslint-disable-next-line no-await-in-loop
      await rafOnce();
      const fits =
        probe.width <= innerW - fitMargin && probe.height <= innerH - fitMargin;
      if (fits) {
        best = mid;
        lo = mid + step;
      } else {
        hi = mid - step;
      }
    }

    if (typeof hint === 'number' && !Number.isNaN(hint)) {
      const near = Math.abs(best - hint) <= deadbandSteps * step;
      if (near) {
        setStyle(hint);
        await rafOnce();
        const ok =
          probe.width <= innerW - fitMargin &&
          probe.height <= innerH - fitMargin;
        if (ok) best = hint;
      }
    }

    probe.destroy({ children: true });
    return best;
  }

  async ensureFontLoaded(
    family: string,
    weight: string,
    size: number
  ): Promise<void> {
    const fonts = globalThis.document?.fonts;
    if (!fonts) return;

    try {
      const cssFamily = this.toCssFontFamily(family);
      await this.registerCustomFont(family, weight);
      await fonts.load(
        `${weight} ${Math.max(1, Math.round(size))}px ${cssFamily}`
      );
      await fonts.ready;
    } catch {
      // Browser/system font shorthands can be invalid for document.fonts.load().
      // Pixi will still render with the browser fallback in that case.
    }
  }

  getFontCssOverrides(family: string): string[] {
    const font = this.customFonts.get(family.trim());
    const cssFamily = this.toCssFontFamily(family);
    const familyOverride = `.pixi-html-text, .pixi-html-text * { font-family: ${cssFamily}, sans-serif !important; }`;
    if (!font) return [familyOverride];

    const fontUrl = font.dataUrl ?? this.resolveFontUrl(font.url);
    const fontFaces = [
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
    ].map(
      (weight) =>
        `@font-face { font-family: ${cssFamily}; src: url("${fontUrl}") format("${font.format}"); font-weight: ${weight}; font-style: normal; }`
    );

    return [...fontFaces, familyOverride];
  }

  private async registerCustomFont(
    family: string,
    weight: string
  ): Promise<void> {
    const familyName = family.trim();
    const font = this.customFonts.get(familyName);
    const fonts = globalThis.document?.fonts;
    const addFontFace = this.getAddFontFace(fonts);
    const FontFaceConstructor = globalThis.FontFace;
    if (!font || !fonts || !addFontFace || !FontFaceConstructor) return;

    const cacheKey = `${familyName}:${weight}`;
    const existing = this.fontLoadPromises.get(cacheKey);
    if (existing) {
      await existing;
      return;
    }

    const loadPromise = (async () => {
      const fontUrl = await this.ensureFontDataUrl(font);
      await Assets.load({
        src: fontUrl,
        data: {
          family: familyName,
        },
      });

      const fontFace = await new FontFaceConstructor(
        familyName,
        `url("${fontUrl}")`,
        {
          style: 'normal',
          weight,
        }
      ).load();

      addFontFace(fonts, fontFace);
      await new FontFaceObserver(familyName, { weight }).load('BESbswy', 5000);
      await fonts.ready;
    })()
      .catch(() => undefined)
      .then(() => undefined);

    this.fontLoadPromises.set(cacheKey, loadPromise);
    await loadPromise;
  }

  private async ensureFontDataUrl(font: CustomFontDefinition): Promise<string> {
    if (font.dataUrl) return font.dataUrl;

    const response = await fetch(this.resolveFontUrl(font.url));
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }

    font.dataUrl = `data:${font.mime};base64,${btoa(binary)}`;
    return font.dataUrl;
  }

  private getAddFontFace(
    fonts: FontFaceSet | undefined
  ): ((target: FontFaceSet, fontFace: FontFace) => void) | undefined {
    if (!fonts || !('add' in fonts)) {
      return undefined;
    }

    const add = fonts.add;
    if (typeof add !== 'function') return undefined;

    return (target, fontFace) => {
      add.call(target, fontFace);
    };
  }

  private resolveFontUrl(url: string): string {
    const baseUrl = globalThis.document?.baseURI ?? globalThis.location?.href;
    if (!baseUrl) return url;

    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return url;
    }
  }

  private toCssFontFamily(family: string): string {
    const trimmed = family.trim();
    if (!trimmed || trimmed.includes(',')) return family;

    const genericFamilies = new Set([
      'serif',
      'sans-serif',
      'monospace',
      'cursive',
      'fantasy',
      'system-ui',
      'ui-serif',
      'ui-sans-serif',
      'ui-monospace',
      'ui-rounded',
      'emoji',
      'math',
      'fangsong',
    ]);
    if (genericFamilies.has(trimmed.toLowerCase())) return trimmed;
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed;
    }

    return `"${trimmed.replace(/"/g, '\\"')}"`;
  }
}
