import { Inject, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { EDITOR_CONFIG, EditorConfig, UiTextStyles } from '../types';

// Editor state types extracted from monolithic component
import type { NodeBase } from '../core';

export interface NodeState {
  id: string;
  type: 'text' | 'image' | 'video' | 'iframe' | 'shape' | 'group' | 'brush';
  ref: NodeBase; // NodeBase reference to the actual Pixi node
}

export interface EditorViewModel {
  nodes: Record<string, NodeState>;
  order: string[];
  selectedIds: string[];
  zoom: number;
  snapEnabled: boolean;
  guidesEnabled: boolean;
  ui: UiTextStyles;
  audioUrl?: string;
  isPlayingAudio: boolean;
}

@Injectable()
export class EditorStore extends ComponentStore<EditorViewModel> {
  constructor(@Inject(EDITOR_CONFIG) cfg: EditorConfig) {
    super({
      nodes: {},
      order: [],
      selectedIds: [],
      zoom: 1,
      snapEnabled: true,
      guidesEnabled: true,
      ui: {
        font: cfg.defaults.family,
        weight: cfg.defaults.weight,
        colorHex: '#ffffff',
        color: 0xffffff,
        align: cfg.defaults.align,
        lineHeight: cfg.defaults.lineHeight,
        min: cfg.defaults.textMin,
        max: cfg.defaults.textMax,
        list: false,
        strokeWidth: 4,
      },
      isPlayingAudio: false,
    });
  }

  // selectors
  readonly nodes$ = this.select((s) => s.nodes);
  readonly selectedIds$ = this.select((s) => s.selectedIds);
  readonly zoom$ = this.select((s) => s.zoom);
  readonly ui$ = this.select((s) => s.ui);
  readonly snapEnabled$ = this.select((s) => s.snapEnabled);
  readonly guidesEnabled$ = this.select((s) => s.guidesEnabled);

  /** One-shot sync snapshot without using protected get() */
  snapshot<T>(project: (s: EditorViewModel) => T): T {
    let value!: T;
    this.select(project).pipe().subscribe((v) => (value = v)).unsubscribe();
    return value;
  }

  // updaters
  readonly setZoom = this.updater<number>((s, zoom) => ({ ...s, zoom }));
  readonly setSnap = this.updater<boolean>((s, snapEnabled) => ({ ...s, snapEnabled }));
  readonly setGuides = this.updater<boolean>((s, guidesEnabled) => ({ ...s, guidesEnabled }));
  readonly setUI = this.updater<Partial<UiTextStyles>>((s, patch) => ({ ...s, ui: { ...s.ui, ...patch } }));
  readonly setSelection = this.updater<string[]>((s, ids) => ({ ...s, selectedIds: ids }));
  readonly addNode = this.updater<NodeState>((s, node) => ({
    ...s,
    nodes: { ...s.nodes, [node.id]: node },
    order: [...s.order, node.id],
  }));
  readonly removeNode = this.updater<string>((s, id) => {
    const { [id]: _removed, ...rest } = s.nodes;
    return {
      ...s,
      nodes: rest,
      order: s.order.filter((x) => x !== id),
      selectedIds: s.selectedIds.filter((x) => x !== id),
    };
  });
  readonly reorder = this.updater<string[]>((s, order) => ({ ...s, order }));
}
