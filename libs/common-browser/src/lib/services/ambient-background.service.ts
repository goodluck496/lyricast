import { Injectable, signal } from '@angular/core';

export type AmbientBackgroundPresetId = 'aurora' | 'lagoon' | 'dusk';

export interface AmbientBackgroundPreset {
  id: AmbientBackgroundPresetId;
  label: string;
  description: string;
  swatches: [string, string, string, string];
  cursorHue: number;
  cursorAccentHue: number;
  staticHues: [number, number, number];
  drifterHues: [number, number, number, number, number, number, number, number];
}

const ENABLED_STORAGE_KEY = 'lyricast.ambient-background';
const PRESET_STORAGE_KEY = 'lyricast.ambient-background-preset';

const PRESETS: AmbientBackgroundPreset[] = [
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Ледяной синий, бирюза и электрический индиго',
    swatches: ['#4f8cff', '#34d7c2', '#7a6dff', '#2f5bff'],
    cursorHue: 210,
    cursorAccentHue: 170,
    staticHues: [204, 166, 236],
    drifterHues: [208, 174, 240, 190, 158, 220, 252, 182],
  },
  {
    id: 'lagoon',
    label: 'Lagoon',
    description: 'Морская волна, изумруд и холодный аквамарин',
    swatches: ['#2f86d8', '#11c98d', '#3ec6b2', '#86d95f'],
    cursorHue: 186,
    cursorAccentHue: 142,
    staticHues: [178, 144, 158],
    drifterHues: [182, 148, 164, 154, 136, 190, 172, 146],
  },
  {
    id: 'dusk',
    label: 'Dusk',
    description: 'Сумеречный фиолетовый, маджента и глубокий синий',
    swatches: ['#5d70ff', '#9c5cff', '#d86ca5', '#4a5ac8'],
    cursorHue: 246,
    cursorAccentHue: 312,
    staticHues: [238, 298, 258],
    drifterHues: [244, 304, 272, 228, 318, 236, 286, 254],
  },
];

function isPresetId(value: string): value is AmbientBackgroundPresetId {
  return PRESETS.some((preset) => preset.id === value);
}

@Injectable({ providedIn: 'root' })
export class AmbientBackgroundManager {
  readonly enabled = signal(true);
  readonly presetId = signal<AmbientBackgroundPresetId>('aurora');
  readonly presets = PRESETS;

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedEnabled = localStorage.getItem(ENABLED_STORAGE_KEY);
      this.enabled.set(storedEnabled !== 'off');

      const storedPreset = localStorage.getItem(PRESET_STORAGE_KEY);
      if (storedPreset && isPresetId(storedPreset)) {
        this.presetId.set(storedPreset);
      }
    } catch {
      this.enabled.set(true);
      this.presetId.set('aurora');
    }
  }

  isEnabled(): boolean {
    return this.enabled();
  }

  setEnabled(value: boolean): void {
    this.enabled.set(value);
    try {
      localStorage.setItem(ENABLED_STORAGE_KEY, value ? 'on' : 'off');
    } catch {
      // ignore storage errors
    }
  }

  getPreset(): AmbientBackgroundPreset {
    return (
      this.presets.find((preset) => preset.id === this.presetId()) ?? this.presets[0]
    );
  }

  setPreset(presetId: AmbientBackgroundPresetId): void {
    this.presetId.set(presetId);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, presetId);
    } catch {
      // ignore storage errors
    }
  }
}
