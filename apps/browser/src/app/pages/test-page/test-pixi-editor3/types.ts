import { InjectionToken } from '@angular/core';

// Shared editor UI types and DI tokens extracted from the monolithic component
export type Align = 'left' | 'center' | 'right';

export interface UiTextStyles {
  font: string;
  weight: string;
  color: number;       // Pixi fill (0xffffff)
  colorHex: string;    // UI control mirror ("#ffffff")
  align: Align;
  lineHeight: number;  // multiplier relative to font size
  min: number;         // min font size
  max: number;         // max font size
  list: boolean;       // render as bulleted list
  strokeWidth?: number; // used by brush/line shapes
}

export interface EditorConfig {
  background: string;
  grid: { size: number; line: number; color: string; alpha: number };
  dragSnap: number;
  resizeSnap: number;
  guides: { enabled: boolean; threshold: number; color: string; alpha: number };
  defaults: {
    textMin: number;
    textMax: number;
    family: string;
    weight: string;
    align: Align;
    lineHeight: number;
    fitStep: number;
    fitMargin: number;
    fitWindow: number;
    deadbandSteps: number;
  };
}

export const EDITOR_CONFIG = new InjectionToken<EditorConfig>('EDITOR_CONFIG');

// Default editor configuration extracted from the component for reuse across sub-files
export const DEFAULT_CONFIG: EditorConfig = {
  background: '#000000',
  grid: { size: 20, line: 1, color: '#ffffff', alpha: 0.08 },
  dragSnap: 5,
  resizeSnap: 2,
  guides: { enabled: true, threshold: 8, color: '#ddddee', alpha: 0.6 },
  defaults: {
    textMin: 16,
    textMax: 160,
    family: 'Inter, system-ui, sans-serif',
    weight: '600',
    align: 'left',
    lineHeight: 1.18,
    fitStep: 2,
    fitMargin: 8,
    fitWindow: 32,
    deadbandSteps: 1,
  },
};

// Max font size for inline textarea editor (px). Change here to adjust globally.
export const INLINE_TEXTAREA_MAX_FONT_PX = 16;
