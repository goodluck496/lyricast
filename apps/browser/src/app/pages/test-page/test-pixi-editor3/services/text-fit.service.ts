import { Inject, Injectable } from '@angular/core';
import { Application, HTMLText } from 'pixi.js';
import { Align, EDITOR_CONFIG, EditorConfig } from '../types';
import { EditorUtilsService } from './editor-utils.service';

/**
 * Service that computes the best font size to fit a given text inside a box.
 * Extracted from the monolithic component and adapted to use EDITOR_CONFIG via DI.
 */
@Injectable({ providedIn: 'any' })
export class TextFitService {
  constructor(
    private readonly utils: EditorUtilsService,
    @Inject(EDITOR_CONFIG) private readonly cfg: EditorConfig
  ) {}

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

    const probe = new HTMLText({
      text,
      style: {
        fontFamily: family,
        // Pixi expects TextStyleFontWeight as specific string tokens (or keywords).
        fontWeight: normalizeFontWeight(weight),
        align,
        wordWrap: true,
        wordWrapWidth: innerW,
        fill:
          baseStyle && typeof baseStyle.fill === 'number'
            ? baseStyle.fill
            : this.utils.colorToNumber('#ffffee'),
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
        wordWrapWidth: number;
      };
      const s = probe.style as unknown as MutableTextStyle;
      s.fontSize = fs;
      s.lineHeight = fs * lineHeight;
      s.wordWrap = true;
      s.breakWords = true;
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
}
