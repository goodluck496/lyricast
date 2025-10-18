/* =============================================================================
  lyri-cast / pixi slide editor – refactor part 2 (clean, full, non-minified)
  -----------------------------------------------------------------------------
  — Single-file module with clearly separated sections (per your request):
    RxJS events, DI, ngrx/component-store, command bus + plugin system,
    nodes (Text/Image/Video/Iframe/Shape/Group/Brush), overlay, guides,
    drag/resize, clipboard, simple context menu, and the Angular component shell.
  — Nothing deleted from your flow; keep-legacy section remains at the end.
  — Readability > compactness: no minification, verbose naming, generous comments.
============================================================================= */

/* ========================== section: imports ============================== */
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Injectable,
  InjectionToken,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentStore } from '@ngrx/component-store';
import {
  Application,
  Assets,
  Container,
  FederatedPointerEvent,
  Graphics,
  Point,
  Rectangle,
  Sprite,
  Text,
  Texture,
  TilingSprite
} from 'pixi.js';
import { fromEvent, fromEventPattern, merge, Subject } from 'rxjs';
import { auditTime, filter, first, map, switchMap, takeUntil, tap } from 'rxjs/operators';

/* ========================= section: shared types & tokens ================= */
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

/* ========================= section: utils.service ========================= */
@Injectable({ providedIn: 'root' })
class EditorUtilsService {
  /** Convert Pixi emitter events to RxJS observable */
  fromPixi<T = any>(emitter: any, event: string) {
    return fromEventPattern<T>(
      (handler) => emitter.on(event, handler),
      (handler) => emitter.off(event, handler)
    );
  }

  snap(value: number, step: number) { return Math.round(value / step) * step; }
  clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

  colorToNumber(input: string | number): number {
    if (typeof input === 'number') return this.clamp(input | 0, 0, 0xffffff);
    const s = (input || '').toString().trim();
    const short = /^#([0-9a-f]{3})$/i.exec(s);
    if (short) { const rgb = short[1].split('').map((x) => x + x).join(''); return parseInt(rgb, 16); }
    const long = /^#([0-9a-f]{6})$/i.exec(s); if (long) return parseInt(long[1], 16);
    const ox = /^0x([0-9a-f]{6})$/i.exec(s); if (ox) return parseInt(ox[1], 16);
    return 0x111827; // slate-900 fallback
  }

  numberToHex(n: number) { return '#' + this.clamp(n | 0, 0, 0xffffff).toString(16).padStart(6, '0'); }

  toWorldLocal(e: FederatedPointerEvent, container: Container) {
    const inv = container.worldTransform.clone().invert();
    const out = new Point();
    inv.apply(e.global, out);
    return out;
  }

  isUrl(text: string) { try { new URL(text); return true; } catch { return false; } }
  isImageUrl(url: string) { return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url); }
  isVideoUrl(url: string) { return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url); }
}

/* ========================= section: default config ======================== */
const DEFAULT_CONFIG: EditorConfig = {
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
const INLINE_TEXTAREA_MAX_FONT_PX = 16;

/* ========================= section: editor-store =========================== */
interface NodeState {
  id: string;
  type: 'text' | 'image' | 'video' | 'iframe' | 'shape' | 'group' | 'brush';
  ref: Container; // the Pixi container instance
}

interface EditorViewModel {
  nodes: Record<string, NodeState>;
  order: string[];           // render order
  selectedIds: string[];     // selected nodes
  zoom: number;
  snapEnabled: boolean;
  guidesEnabled: boolean;
  ui: UiTextStyles;          // reflects current text UI (for a single selection)
  audioUrl?: string;         // background audio (optional)
  isPlayingAudio: boolean;
}

@Injectable()
class EditorStore extends ComponentStore<EditorViewModel> {
  constructor() {
    super({
      nodes: {},
      order: [],
      selectedIds: [],
      zoom: 1,
      snapEnabled: true,
      guidesEnabled: true,
      ui: {
        font: DEFAULT_CONFIG.defaults.family,
        weight: DEFAULT_CONFIG.defaults.weight,
        colorHex: '#ffffff',
        color: 0xffffff,
        align: DEFAULT_CONFIG.defaults.align,
        lineHeight: DEFAULT_CONFIG.defaults.lineHeight,
        min: DEFAULT_CONFIG.defaults.textMin,
        max: DEFAULT_CONFIG.defaults.textMax,
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
    this.select(project).pipe(first()).subscribe((v) => (value = v));
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

/* ========================= section: command-bus ============================ */
export type EditorCommand =
  | { t: 'SELECT'; ids: string[] }
  | { t: 'ADD_TEXT'; x: number; y: number; w?: number; h?: number; text?: string }
  | { t: 'ADD_IMAGE'; url: string; x?: number; y?: number; w?: number; h?: number }
  | { t: 'ADD_VIDEO'; url: string; x?: number; y?: number; w?: number; h?: number }
  | { t: 'SET_AUDIO'; url?: string }
  | { t: 'PLAY_AUDIO' | 'PAUSE_AUDIO' }
  | { t: 'ADD_IFRAME'; url: string; x?: number; y?: number; w?: number; h?: number }
  | { t: 'ADD_SHAPE'; shape: 'rect' | 'ellipse' | 'line'; x: number; y: number; w?: number; h?: number }
  | { t: 'START_BRUSH' }
  | { t: 'GROUP'; ids: string[] }
  | { t: 'UNGROUP'; id: string }
  | { t: 'DELETE'; ids?: string[] }
  | { t: 'DUPLICATE'; ids?: string[] }
  | { t: 'APPLY_STYLE'; patch: Partial<UiTextStyles> }
  | { t: 'MOVE'; id: string; x: number; y: number }
  | { t: 'RESIZE'; id: string; w: number; h: number }
  | { t: 'ZOOM'; z: number }
  | { t: 'SNAP'; on: boolean }
  | { t: 'GUIDES'; on: boolean }
  | { t: 'PASTE_CLIPBOARD' };

@Injectable()
class CommandBusService {
  private readonly subject = new Subject<EditorCommand>();
  readonly commands$ = this.subject.asObservable();
  emit(cmd: EditorCommand) { this.subject.next(cmd); }
}

export interface EditorPlugin {
  id: string;
  init(ctx: EditorContext): void;
  dispose?(): void;
}

export interface EditorContext {
  app: Application;
  world: Container & { app: Application };
  store: EditorStore;
  bus: CommandBusService;
  utils: EditorUtilsService;
  overlay: OverlayService;
  guides: GuideLayer;
  cfg: EditorConfig;
}

/* ========================= section: base nodes ============================= */
let ID_SEQUENCE = 1;
function generateId(prefix: string) { return `${prefix}_${ID_SEQUENCE++}`; }

abstract class NodeBase extends Container {
  selected = false;
  id = generateId('node');
  w = 400;
  h = 200;
  padding = 12;
  snap = true;

  frame = new Graphics();
  handlesContainer = new Container();
  handleRects: Record<string, Graphics> = {};

  constructor() {
    super();
    this.addChild(this.frame, this.handlesContainer);
    this.eventMode = 'static';
    this.handlesContainer.visible = false; // only show for selected
  }

  setSelected(on: boolean) {
    // Do nothing if this node (or its frame) has been destroyed
    // This prevents errors when selection toggles after a node was deleted
    // (e.g., during bulk delete + async SELECT event processing)
    if ((this as any).destroyed) return;
    this.selected = on;
    if (this.handlesContainer && !(this as any).handlesContainer?.destroyed) {
      this.handlesContainer.visible = !!on;
    }
    this.drawFrame();
    // ensure handles are on top
    if (this.children?.length && this.handlesContainer && !(this as any).handlesContainer?.destroyed) this.addChild(this.handlesContainer);
  }

  abstract applyBoxSize(w: number, h: number): void;

  drawFrame() {
    // Avoid drawing if this node or its graphics were destroyed
    if ((this as any).destroyed) return;
    const g = this.frame as any;
    if (!g || g.destroyed || typeof g.clear !== 'function') return;
    g.clear();
    const strokeColor = this.selected ? 0x99ffaa : 0x6b7280; // green vs gray
    const strokeAlpha = this.selected ? 0.9 : 0.5;
    // selection frame: only stroke, no fill, so it doesn't cover node content
    g.roundRect(0, 0, this.w, this.h, 8)
      .stroke({ color: strokeColor, width: 1, alpha: strokeAlpha });
    // Expand hit area to include handle hit pads outside the box (especially rotation handle above)
    const marginTop = 40;    // covers rotation handle at y=-28 with 24px hit pad
    const marginSide = 14;   // allow near-clicks at corners/edges
    const marginBottom = 14; // small extra below
    this.hitArea = new Rectangle(-marginSide, -marginTop, this.w + marginSide * 2, this.h + marginTop + marginBottom);
  }

  drawHandles(initialize = false) {
    const names = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'] as const;
    const positions: Record<string, [number, number]> = {
      nw: [0, 0],
      n: [this.w / 2, 0],
      ne: [this.w, 0],
      e: [this.w, this.h / 2],
      se: [this.w, this.h],
      s: [this.w / 2, this.h],
      sw: [0, this.h],
      w: [0, this.h / 2],
      rot: [this.w / 2, -28],
    };

    if (initialize) {
      this.handlesContainer.removeChildren();
      this.handleRects = {} as any;
    }

    for (const name of names) {
      let g = this.handleRects[name];
      if (!g) {
        g = new Graphics();
        this.handleRects[name] = g;
        this.handlesContainer.addChild(g);
        g.eventMode = 'static';
        // Larger hit area than visual to allow near-clicks; smaller visuals for a cleaner look
        // Rot handle gets a slightly larger interactive pad
        g.hitArea = name === 'rot' ? new Rectangle(-12, -12, 24, 24) : new Rectangle(-10, -10, 20, 20);
      }
      g.clear();
      if (name === 'rot') {
        // rotation handle: smaller circle with connector line
        const nPos = positions['n'];
        g.moveTo(0, 6).lineTo(0, 16).stroke({ color: 0xeeff99, width: 1 });
        g.circle(0, 0, 6).fill(0xffffff).stroke({ color: 0x99ffaa, width: 1 });
        g.cursor = 'grab';
      } else {
        // smaller visual square, bigger interactive area (above)
        g.roundRect(-5, -5, 10, 10, 2).fill(0xffffff).stroke({ color: 0xeeff99, width: 1 });
        g.cursor =
          name === 'n' || name === 's' ? 'ns-resize' :
            name === 'e' || name === 'w' ? 'ew-resize' :
              name === 'ne' || name === 'sw' ? 'nesw-resize' :
                'nwse-resize';
      }
      const [x, y] = positions[name];
      g.position.set(x, y);
      g.name = name as any;
    }
  }
}

/* ========================= section: text-fit.service ======================= */
@Injectable({ providedIn: 'root' })
class TextFitService {
  constructor(private readonly utils: EditorUtilsService) {}

  async fitBinary(options: {
    app: Application;
    text: string;
    boxW: number;
    boxH: number;
    padding: number;
    baseStyle: Partial<Text['style']>;
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
      min = DEFAULT_CONFIG.defaults.textMin,
      max = DEFAULT_CONFIG.defaults.textMax,
      step = DEFAULT_CONFIG.defaults.fitStep,
      fitMargin = DEFAULT_CONFIG.defaults.fitMargin,
      family = DEFAULT_CONFIG.defaults.family,
      weight = DEFAULT_CONFIG.defaults.weight,
      align = DEFAULT_CONFIG.defaults.align,
      lineHeight = DEFAULT_CONFIG.defaults.lineHeight,
      hint,
      window = DEFAULT_CONFIG.defaults.fitWindow,
      deadbandSteps = DEFAULT_CONFIG.defaults.deadbandSteps,
    } = options;

    const innerW = Math.max(4, options.boxW - options.padding * 2);
    const innerH = Math.max(4, options.boxH - options.padding * 2);
    if (innerW <= 6 || innerH <= 6) return min;

    const probe = new Text({
      text,
      style: {
        fontFamily: family,
        fontWeight: weight as any,
        align,
        wordWrap: true,
        wordWrapWidth: innerW,
        fill: this.utils.colorToNumber('#ffffee'),
        ...(baseStyle as any),
      } as any,
    });
    probe.visible = false;
    app.stage.addChild(probe);

    const setStyle = (fs: number) => {
      (probe.style as any).fontSize = fs;
      (probe.style as any).lineHeight = fs * lineHeight;
      (probe.style as any).wordWrap = true;
      (probe.style as any).breakWords = true;
      (probe.style as any).wordWrapWidth = innerW;
    };

    const rafOnce = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

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
      const fits = probe.width <= innerW - fitMargin && probe.height <= innerH - fitMargin;
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
        const ok = probe.width <= innerW - fitMargin && probe.height <= innerH - fitMargin;
        if (ok) best = hint;
      }
    }

    probe.destroy({ children: true });
    return best;
  }
}

/* ========================= section: nodes ================================ */
class TextNode extends NodeBase {
  readonly type = 'text' as const;

  text = 'Double-click to edit';
  style: UiTextStyles = {
    font: DEFAULT_CONFIG.defaults.family,
    weight: DEFAULT_CONFIG.defaults.weight,
    align: DEFAULT_CONFIG.defaults.align,
    lineHeight: DEFAULT_CONFIG.defaults.lineHeight,
    min: DEFAULT_CONFIG.defaults.textMin,
    max: DEFAULT_CONFIG.defaults.textMax,
    color: 0xffffff,
    colorHex: '#ffffff',
    list: false,
  };

  private lastCalculatedFontSize = 32;
  private fitScheduled = false;
  private readonly textDisplay = new Text('');

  constructor(private readonly app: Application, private readonly fitter: TextFitService) {
    super();
    this.addChild(this.textDisplay);
    // keep handles on top
    this.addChild(this.handlesContainer);
    this.drawFrame();
    this.drawHandles(true);
  }

  applyBoxSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawFrame();
    this.drawHandles();
  }

  requestFit() {
    if (this.fitScheduled) return;
    this.fitScheduled = true;
    requestAnimationFrame(() => {
      this.fitScheduled = false;
      void this.layout();
    });
  }

  async layout() {
    const preparedText = this.style.list ? this
        .text
        .split(/ ?/)
        .map((line) => (line.trim() ? `• ${line}` : ''))
        .join('')
      : this.text;

    // assign visible text before measuring to ensure render updates
    this.textDisplay.text = preparedText;

    const size = await this.fitter.fitBinary({
      app: this.app,
      text: preparedText,
      boxW: this.w,
      boxH: this.h,
      padding: this.padding,
      baseStyle: { fill: this.style.color },
      min: this.style.min,
      max: this.style.max,
      step: DEFAULT_CONFIG.defaults.fitStep,
      fitMargin: DEFAULT_CONFIG.defaults.fitMargin,
      family: this.style.font,
      weight: this.style.weight as any,
      align: this.style.align,
      lineHeight: this.style.lineHeight,
      hint: this.lastCalculatedFontSize,
      window: DEFAULT_CONFIG.defaults.fitWindow,
      deadbandSteps: DEFAULT_CONFIG.defaults.deadbandSteps,
    });

    this.lastCalculatedFontSize = size;

    Object.assign(this.textDisplay.style as any, {
      fontFamily: this.style.font,
      fontWeight: this.style.weight,
      align: this.style.align,
      wordWrap: true,
      breakWords: true,
      fill: this.style.color,
      lineHeight: size * this.style.lineHeight,
      fontSize: size,
      wordWrapWidth: Math.max(4, this.w - this.padding * 2),
    });

    const anchorX = this.style.align === 'center' ? 0.5 : this.style.align === 'right' ? 1 : 0;
    (this.textDisplay as any).anchor?.set(anchorX, 0);

    const innerW = Math.max(4, this.w - this.padding * 2);
    const x = this.padding + innerW * anchorX;
    const y = this.padding;
    this.textDisplay.position.set(Math.round(x), Math.round(y));
  }
}

// Robust texture loader for http(s), blob:, and data: URLs with fallbacks
async function ensureTextureValid(tex: Texture): Promise<void> {
  // If already valid with non-zero size, resolve immediately
  if ((tex as any)?.valid && tex.width > 0 && tex.height > 0) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      const bt: any = (tex as any).baseTexture;
      if (bt && typeof bt.once === 'function') {
        bt.once('loaded', finish);
        bt.once('error', finish);
      }
      const res: any = bt?.resource;
      const img: any = res?.source;
      if (img && img instanceof Image) {
        img.onload = finish;
        img.onerror = finish;
      }
    } catch { /* ignore */ }
    // Safety timeout in case events do not fire
    setTimeout(finish, 1000);
  });
}

async function loadTextureRobust(url: string): Promise<Texture> {
  // 1) Try Pixi Assets pipeline
  try {
    const t = (await Assets.load(url)) as Texture;
    if (t) { await ensureTextureValid(t); return t; }
  } catch { /* continue */ }
  // 2) Try direct Texture.from (string URL)
  try {
    const t = Texture.from(url as any);
    if (t) { await ensureTextureValid(t); return t; }
  } catch { /* continue */ }
  // 3) Manual HTMLImage decode as a last resort (works great for blob:/data:)
  try {
    const img = new Image();
    (img as any).crossOrigin = 'anonymous';
    img.src = url;
    if ((img as any).decode) { try { await (img as any).decode(); } catch { /* older browsers */ } }
    const t = Texture.from(img);
    await ensureTextureValid(t);
    return t;
  } catch { /* continue */ }
  throw new Error('Failed to load texture from URL: ' + url);
}

class ImageNode extends NodeBase {
  readonly type = 'image' as const;
  sprite = new Sprite();

  constructor(url?: string) {
    super();
    if (url) void this.setUrl(url);
    this.drawFrame();
    this.drawHandles(true);
    this.addChild(this.sprite);
    // keep handles above content
    this.addChild(this.handlesContainer);
  }

  async setUrl(url: string) {
    try {
      const texture = await loadTextureRobust(url);
      if (!texture) throw new Error('Failed to load image texture');
      this.sprite.texture = texture;
      this.sprite.anchor.set(0.5);
      this.sprite.position.set(this.w / 2, this.h / 2);
      const tw = texture.width || (texture as any)?.baseTexture?.realWidth || this.w;
      const th = texture.height || (texture as any)?.baseTexture?.realHeight || this.h;
      const scale = Math.min(this.w / Math.max(1, tw), this.h / Math.max(1, th));
      this.sprite.scale.set(scale);
      // keep handles above content
      this.addChild(this.handlesContainer);
    } catch (err) {
      console.warn('Image load failed:', err);
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
}

class VideoNode extends NodeBase {
  readonly type = 'video' as const;
  sprite = new Sprite();

  constructor(url?: string) {
    super();
    if (url) void this.setUrl(url);
    this.drawFrame();
    this.drawHandles(true);
    this.addChild(this.sprite);
    // keep handles above content
    this.addChild(this.handlesContainer);
  }

  async setUrl(url: string) {
    try {
      const texture = (await Assets.load(url)) as Texture;
      if (!texture) throw new Error('Failed to load video texture');
      const res: any = texture.baseTexture?.resource as any;
      const videoEl: HTMLVideoElement | null = res && res.source instanceof HTMLVideoElement ? (res.source as HTMLVideoElement) : null;
      if (videoEl) { videoEl.muted = true; videoEl.loop = true; void videoEl.play(); }
      this.sprite.texture = texture;
      this.sprite.anchor.set(0.5);
      this.sprite.position.set(this.w / 2, this.h / 2);
      const tw = texture.width || this.w, th = texture.height || this.h;
      this.sprite.scale.set(Math.min(this.w / tw, this.h / th));
    } catch (err) {
      // Gracefully degrade if loading fails (e.g., unsupported provider like YouTube)
      // Keep empty sprite to avoid breaking editor; use console for diagnostics
      console.warn('Video load failed:', err);
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
}

/** IframeNode is rendered via DOM overlay (not inside Pixi). */
class IframeNode extends NodeBase {
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

class ShapeNode extends NodeBase {
  readonly type = 'shape' as const;
  shape: 'rect' | 'ellipse' | 'line' = 'rect';
  stroke = 0xffffff;
  fill = 0x000000;
  lineWidth = 2;
  private shapeG = new Graphics();

  constructor(kind: 'rect' | 'ellipse' | 'line' = 'rect') {
    super();
    this.shape = kind;
    // insert shape graphics above the selection frame but below handles
    this.addChild(this.shapeG);
    this.addChild(this.handlesContainer);
    this.redraw();
    this.drawHandles(true);
  }

  private redraw() {
    const g = this.shapeG;
    g.clear();
    if (this.shape === 'rect') {
      g.roundRect(0, 0, this.w, this.h, 6)
        .fill(this.fill)
        .stroke({ color: this.stroke, width: this.lineWidth });
    } else if (this.shape === 'ellipse') {
      g.ellipse(this.w / 2, this.h / 2, this.w / 2, this.h / 2)
        .fill(this.fill)
        .stroke({ color: this.stroke, width: this.lineWidth });
    } else {
      // Line shape: always render as 1px thick regardless of box height
      const thickness = 1;
      const midY = thickness / 2;
      g.moveTo(0, midY).lineTo(this.w, midY)
        .stroke({ color: this.stroke, width: thickness, cap: 'round' as any });
    }
  }

  applyBoxSize(w: number, h: number): void {
    this.w = w;
    // For line shape, lock height to 1px regardless of input
    this.h = this.shape === 'line' ? 1 : h;
    this.redraw();
    this.drawHandles();
  }
}

class GroupNode extends NodeBase {
  readonly type = 'group' as const;
  constructor() { super(); this.drawHandles(true); }
  get childrenIds(): string[] {
    return this.children.filter((c): c is NodeBase => c instanceof NodeBase).map((c) => (c as NodeBase).id);
  }
  applyBoxSize(w: number, h: number): void {
    const prevW = this.w || 1;
    const prevH = this.h || 1;
    this.w = w; this.h = h;
    const sx = prevW > 0 ? w / prevW : 1;
    const sy = prevH > 0 ? h / prevH : 1;
    // Scale children proportionally
    for (const ch of this.children) {
      if (ch instanceof NodeBase) {
        ch.x *= sx; ch.y *= sy;
        const newW = Math.max(1, ch.w * sx);
        const newH = Math.max(1, ch.h * sy);
        ch.applyBoxSize(newW, newH);
        if (ch instanceof TextNode) ch.requestFit();
      }
    }
    this.drawFrame(); this.drawHandles();
  }
}

/* ========================= section: brush node ============================ */
class BrushNode extends NodeBase {
  readonly type = 'brush' as const;
  stroke = 0xffffff;
  strokeWidth = 4;
  private path: Point[] = [];
  private g = new Graphics();

  constructor() {
    super();
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
    this.path = points.map(p => new Point(p.x, p.y));
    this.redraw();
  }

  private redraw() {
    const g = this.g;
    g.clear();
    if (!this.path.length) return;
    g.moveTo(this.path[0].x, this.path[0].y);
    for (const p of this.path) g.lineTo(p.x, p.y);
    g.stroke({ color: this.stroke, width: this.strokeWidth, cap: 'round' as any, join: 'round' as any });
  }

  applyBoxSize(w: number, h: number): void {
    // scale path to new box size
    const sx = this.w > 0 ? w / this.w : 1;
    const sy = this.h > 0 ? h / this.h : 1;
    this.w = w; this.h = h;
    this.path = this.path.map(p => new Point(p.x * sx, p.y * sy));
    this.redraw();
    this.drawHandles();
  }
}

/* ========================= section: brush layer =========================== */
class BrushLayer extends Container {
  private points: Point[] = [];
  private g = new Graphics();
  constructor() { super(); this.addChild(this.g); }
  start(x: number, y: number) { this.points = [new Point(x, y)]; }
  add(x: number, y: number) { this.points.push(new Point(x, y)); this.redraw(); }
  end() { this.points = []; }
  private redraw() {
    const g = this.g;
    g.clear();
    if (!this.points.length) return;
    g.moveTo(this.points[0].x, this.points[0].y);
    for (const p of this.points) g.lineTo(p.x, p.y);
    g.stroke({ color: 0xffffff, width: 2 });
  }
}

/* ========================= section: guide-layer ============================ */
class GuideLayer extends Container {
  private lines = new Graphics();
  enabled = true;
  threshold = DEFAULT_CONFIG.guides.threshold;

  constructor(private readonly world: Container & { app: Application }, private readonly cfg: EditorConfig) {
    super();
    this.addChild(this.lines);
    this.enabled = cfg.guides.enabled;
    this.threshold = cfg.guides.threshold;
  }

  private collect(exclude?: Container) {
    const vx: number[] = [];
    const vy: number[] = [];

    for (const c of this.world.children) {
      if (!(c instanceof NodeBase) || c === exclude) continue;
      vx.push(c.x, c.x + c.w / 2, c.x + c.w);
      vy.push(c.y, c.y + c.h / 2, c.y + c.h);
    }

    const stageW = this.world.app.renderer.width / (this.world.scale.x || 1);
    const stageH = this.world.app.renderer.height / (this.world.scale.y || 1);
    vx.push(stageW / 2);
    vy.push(stageH / 2);

    return { vx, vy };
  }

  snap(exclude: NodeBase, x: number, y: number, w: number, h: number) {
    if (!this.enabled) return { x, y, lines: [] as any[] };

    const { vx, vy } = this.collect(exclude);
    const lines: any[] = [];

    // X snapping
    const anchorsX = [x, x + w / 2, x + w];
    let snappedX = x;
    let bestDx = Number.POSITIVE_INFINITY;
    let selX: { gx: number; i: number } | null = null;

    for (const gx of vx) {
      for (let i = 0; i < 3; i++) {
        const d = Math.abs(anchorsX[i] - gx);
        if (d < bestDx && d <= this.threshold) { bestDx = d; selX = { gx, i }; }
      }
    }

    if (selX) {
      const { gx, i } = selX;
      snappedX = [gx, gx - w / 2, gx - w][i];
      lines.push({ t: 'v', x: gx });
    }

    // Y snapping
    const anchorsY = [y, y + h / 2, y + h];
    let snappedY = y;
    let bestDy = Number.POSITIVE_INFINITY;
    let selY: { gy: number; i: number } | null = null;

    for (const gy of vy) {
      for (let i = 0; i < 3; i++) {
        const d = Math.abs(anchorsY[i] - gy);
        if (d < bestDy && d <= this.threshold) { bestDy = d; selY = { gy, i }; }
      }
    }

    if (selY) {
      const { gy, i } = selY;
      snappedY = [gy, gy - h / 2, gy - h][i];
      lines.push({ t: 'h', y: gy });
    }

    return { x: snappedX, y: snappedY, lines };
  }

  draw(lines: any[]) {
    this.lines.clear();
    if (!this.enabled || !lines.length) return;

    const stageW = this.world.app.renderer.width / (this.world.scale.x || 1);
    const stageH = this.world.app.renderer.height / (this.world.scale.y || 1);
    const color = 0xbfd3ff; // soft blue

    for (const l of lines) {
      if (l.t === 'v') {
        this.lines.moveTo(l.x, 0).lineTo(l.x, stageH).stroke({ color, width: 1, alpha: this.cfg.guides.alpha });
      } else {
        this.lines.moveTo(0, l.y).lineTo(stageW, l.y).stroke({ color, width: 1, alpha: this.cfg.guides.alpha });
      }
    }
  }
}

/* ========================= section: drag-resize.service ==================== */
// @Injectable()
class DragResizeService {
  constructor(
    private readonly cfg: EditorConfig,
    private readonly store: EditorStore,
    private readonly guides: GuideLayer,
    private readonly world: Container & { app: Application },
    private readonly app: Application,
    private readonly bus: CommandBusService,
    private readonly utils: EditorUtilsService,
    private readonly overlay?: OverlayService,
  ) {}

  bind(node: NodeBase, destroy$: Subject<void>) {
    node.eventMode = 'static';
    node.cursor = 'move';

    const move$ = this.utils.fromPixi<FederatedPointerEvent>(this.app.stage, 'globalpointermove');
    const up$ = merge(
      this.utils.fromPixi<FederatedPointerEvent>(this.app.stage, 'pointerup'),
      this.utils.fromPixi<FederatedPointerEvent>(this.app.stage, 'pointerupoutside'),
      this.utils.fromPixi<FederatedPointerEvent>(this.app.stage, 'pointercancel'),
    );

    // selection on mouse down
    this.utils.fromPixi<FederatedPointerEvent>(node, 'pointerdown')
      .pipe(takeUntil(destroy$))
      .subscribe((e) => {
        e.stopPropagation();
        this.overlay?.setIframeInteractive(false);
        const mult = (e.ctrlKey || (e as any).metaKey);
        const current = this.store.snapshot(s => s.selectedIds);
        if (mult) {
          const set = new Set(current);
          if (set.has(node.id)) set.delete(node.id); else set.add(node.id);
          this.bus.emit({ t: 'SELECT', ids: Array.from(set) });
        } else {
          this.bus.emit({ t: 'SELECT', ids: [node.id] });
        }
      });

    // drag (when not on a handle)
    this.utils.fromPixi<FederatedPointerEvent>(node, 'pointerdown').pipe(
      filter((e) => !this.isOnHandle(node, e)),
      map((e) => ({ start: this.utils.toWorldLocal(e, this.world), origin: { x: node.x, y: node.y } })),
      switchMap((startState) =>
        move$.pipe(
          map((m) => this.utils.toWorldLocal(m, this.world)),
          auditTime(0),
          map((p) => {
            let nextX = startState.origin.x + (p.x - startState.start.x);
            let nextY = startState.origin.y + (p.y - startState.start.y);
            const snapOn = this.store.snapshot(s => s.snapEnabled);
            if (node.snap && snapOn) {
              nextX = this.utils.snap(nextX, this.cfg.dragSnap);
              nextY = this.utils.snap(nextY, this.cfg.dragSnap);
            }
            const snapped = this.guides.snap(node, nextX, nextY, node.w, node.h);
            this.guides.draw(snapped.lines);
            return { x: snapped.x, y: snapped.y };
          }),
          takeUntil(up$),
        )
      ),
      takeUntil(destroy$)
    ).subscribe((pos) => {
      node.position.set(pos.x, pos.y);
      this.bus.emit({ t: 'MOVE', id: node.id, x: pos.x, y: pos.y });
      this.overlay?.syncToNode(node);
    });

    // resize/rotate via handles
    Object.entries(node.handleRects).forEach(([handleName, handleGraphic]) => {
      this.utils.fromPixi<FederatedPointerEvent>(handleGraphic, 'pointerdown').pipe(
        tap((e) => e.stopPropagation()),
        map((e) => {
          const start = this.utils.toWorldLocal(e, this.world);
          const begin = { x: node.x, y: node.y, w: node.w, h: node.h, rotation: node.rotation };
          // Pre-calculate the opposite anchor (fixed point) in world space for this handle
          const hn = handleName;
          let ax = 0, ay = 0;
          if (hn === 'se') { ax = 0; ay = 0; }
          else if (hn === 'ne') { ax = 0; ay = begin.h; }
          else if (hn === 'sw') { ax = begin.w; ay = 0; }
          else if (hn === 'nw') { ax = begin.w; ay = begin.h; }
          else if (hn === 'e') { ax = 0; ay = begin.h / 2; }
          else if (hn === 'w') { ax = begin.w; ay = begin.h / 2; }
          else if (hn === 'n') { ax = begin.w / 2; ay = begin.h; }
          else if (hn === 's') { ax = begin.w / 2; ay = 0; }
          const cos = Math.cos(begin.rotation || 0);
          const sin = Math.sin(begin.rotation || 0);
          const anchorWorld = { x: begin.x + (ax * cos - ay * sin), y: begin.y + (ax * sin + ay * cos) };
          return { handleName, start, begin, anchorWorld };
        }),
        switchMap((startState) =>
          move$.pipe(
            map((m) => this.utils.toWorldLocal(m, this.world)),
            auditTime(0),
            map((p) => {
              if (startState.handleName === 'rot') {
                // Compute world-space center correctly for rotated node and keep it fixed during rotation
                const cos0 = Math.cos(startState.begin.rotation || 0);
                const sin0 = Math.sin(startState.begin.rotation || 0);
                const cx = startState.begin.x + (startState.begin.w / 2) * cos0 - (startState.begin.h / 2) * sin0;
                const cy = startState.begin.y + (startState.begin.w / 2) * sin0 + (startState.begin.h / 2) * cos0;
                const a0 = Math.atan2(startState.start.y - cy, startState.start.x - cx);
                const a1 = Math.atan2(p.y - cy, p.x - cx);
                let ang = startState.begin.rotation + (a1 - a0);
                const snapOn = this.store.snapshot(s => s.snapEnabled);
                if (snapOn) {
                  const step = Math.PI / 12; // 15 degrees
                  ang = Math.round(ang / step) * step;
                }
                return { rotate: true, rotation: ang, cx, cy, bw: startState.begin.w, bh: startState.begin.h } as any;
              }
              const minW = 80; const minH = 40;
              let nx = startState.begin.x; let ny = startState.begin.y; let nw = startState.begin.w; let nh = startState.begin.h;
              if (startState.handleName.includes('e')) nw = Math.max(minW, p.x - startState.begin.x);
              if (startState.handleName.includes('s')) nh = Math.max(minH, p.y - startState.begin.y);
              if (startState.handleName.includes('w')) { const px = Math.min(startState.begin.x + startState.begin.w - minW, p.x); nw = Math.max(minW, startState.begin.x + startState.begin.w - px); nx = px; }
              if (startState.handleName.includes('n')) { const py = Math.min(startState.begin.y + startState.begin.h - minH, p.y); nh = Math.max(minH, startState.begin.y + startState.begin.h - py); ny = py; }
              const snapOn = this.store.snapshot(s => s.snapEnabled);
              if (node.snap && snapOn) { nw = this.utils.snap(nw, this.cfg.resizeSnap); nh = this.utils.snap(nh, this.cfg.resizeSnap); nx = this.utils.snap(nx, this.cfg.resizeSnap); ny = this.utils.snap(ny, this.cfg.resizeSnap); }
              const snapped = this.guides.snap(node, nx, ny, nw, nh);
              this.guides.draw(snapped.lines);
              return { nx: snapped.x, ny: snapped.y, nw, nh, rot: startState.begin.rotation, anchorWorld: startState.anchorWorld, handleName: startState.handleName } as any;
            }),
            takeUntil(up$),
          )
        ),
        takeUntil(destroy$)
      ).subscribe((result: any) => {
        if (result?.rotate) {
          // Keep visual center fixed while rotating around the center
          const { rotation, cx, cy, bw, bh } = result;
          node.rotation = rotation;
          if (typeof cx === 'number' && typeof cy === 'number' && typeof bw === 'number' && typeof bh === 'number') {
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            const dx = (bw / 2) * cos - (bh / 2) * sin;
            const dy = (bw / 2) * sin + (bh / 2) * cos;
            node.x = cx - dx;
            node.y = cy - dy;
          }
          this.overlay?.syncToNode(node);
          return;
        }
        let { nx, ny, nw, nh } = result;
        // If node is rotated, keep the opposite anchor fixed in world during resize
        if (result && typeof result.rot === 'number' && result.rot !== 0 && result.anchorWorld) {
          const rot = result.rot as number;
          const hn = result.handleName as string;
          let axNew = 0, ayNew = 0;
          if (hn === 'se') { axNew = 0; ayNew = 0; }
          else if (hn === 'ne') { axNew = 0; ayNew = nh; }
          else if (hn === 'sw') { axNew = nw; ayNew = 0; }
          else if (hn === 'nw') { axNew = nw; ayNew = nh; }
          else if (hn === 'e') { axNew = 0; ayNew = nh / 2; }
          else if (hn === 'w') { axNew = nw; ayNew = nh / 2; }
          else if (hn === 'n') { axNew = nw / 2; ayNew = nh; }
          else if (hn === 's') { axNew = nw / 2; ayNew = 0; }
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          nx = result.anchorWorld.x - (axNew * cos - ayNew * sin);
          ny = result.anchorWorld.y - (axNew * sin + ayNew * cos);
        }
        node.x = nx; node.y = ny; node.applyBoxSize(nw, nh);
        if (node instanceof TextNode) node.requestFit();
        this.bus.emit({ t: 'RESIZE', id: node.id, w: nw, h: nh });
        this.overlay?.syncToNode(node);
      });
    });

    up$.pipe(takeUntil(destroy$)).subscribe(() => this.guides.draw([]));
  }

  private isOnHandle(node: NodeBase, e: FederatedPointerEvent) {
    const local = e.getLocalPosition(node);
    const hot = 9; // px
    const points: Record<string, [number, number]> = {
      nw: [0, 0], n: [node.w / 2, 0], ne: [node.w, 0], e: [node.w, node.h / 2], se: [node.w, node.h], s: [node.w / 2, node.h], sw: [0, node.h], w: [0, node.h / 2],
    };
    return Object.values(points).some(([x, y]) => Math.abs(local.x - x) <= hot && Math.abs(local.y - y) <= hot);
  }
}

/* ========================= section: overlay.service ======================= */
@Injectable()
class OverlayService {
  private hostEl?: HTMLDivElement;
  private textareaEl?: HTMLTextAreaElement;
  private iframeEl?: HTMLIFrameElement;

  constructor(private readonly store: EditorStore) {}

  setHost(element: HTMLDivElement) { this.hostEl = element; }

  // Safely remove an element if it is still in the DOM (avoid NotFoundError on double remove)
  private safeRemove(el?: Element | null) {
    try {
      if (!el) return;
      // If it's still connected, prefer parentNode.removeChild to avoid polyfill quirks
      if ((el as any).isConnected) {
        const parent = el.parentNode as (Node & ParentNode) | null;
        if (parent) {
          try { parent.removeChild(el); } catch { /* ignore */ }
        } else {
          try { (el as any).remove?.(); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  private editingTextNode?: TextNode;

  attachTextarea(node: TextNode, opts?: { onClose?: () => void }) {
    if (!this.hostEl) return;

    const bounds = node.getBounds();
    const ta = document.createElement('textarea');
    ta.value = node.text;

    const scaleY = bounds.height / node.h;
    const deg = (node.rotation || 0) * 180 / Math.PI;
    Object.assign(ta.style, {
      position: 'absolute',
      left: `${bounds.x}px`, top: `${bounds.y}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
      padding: `${node.padding * scaleY}px`,
      background: 'rgba(0,0,0,0.85)', color: '#e5e7eb',
      border: '1px solid #334155', borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
      outline: 'none', resize: 'none',
      fontFamily: node.style.font, fontWeight: node.style.weight as any,
      fontSize: `${Math.min(INLINE_TEXTAREA_MAX_FONT_PX, Math.max(node.style.min, Math.min(node.style.max, (node as any).lastCalculatedFontSize ?? 24)) * scaleY)}px`,
      lineHeight: `${node.style.lineHeight}`,
      zIndex: '10', whiteSpace: 'pre-wrap',
      transform: `rotate(${deg}deg)`,
      transformOrigin: 'center center',
    } as CSSStyleDeclaration);

    this.hostEl.appendChild(ta); this.textareaEl = ta; this.editingTextNode = node; ta.focus(); ta.select();

    const done$ = new Subject<void>();
    const finish = (commit: boolean) => {
      const currentTA = this.textareaEl;
      const currentNode = this.editingTextNode;
      if (commit && currentNode && currentTA) { currentNode.text = currentTA.value; currentNode.requestFit(); }
      // Clear refs first to prevent re-entrancy issues (e.g., blur + external close)
      this.textareaEl = undefined;
      this.editingTextNode = undefined;
      this.safeRemove(currentTA || ta);
      opts?.onClose?.();
      done$.next();
      done$.complete();
    };

    fromEvent<KeyboardEvent>(ta, 'keydown').pipe(takeUntil(done$)).subscribe((e) => {
      if (e.key === 'Escape') finish(false);
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') finish(true);
    });
    // Не даём всплывать paste из редактора, чтобы не срабатывала глобальная вставка
    fromEvent<ClipboardEvent>(ta, 'paste').pipe(takeUntil(done$)).subscribe((ev) => ev.stopPropagation());
    fromEvent<FocusEvent>(ta, 'blur').pipe(takeUntil(done$)).subscribe(() => finish(true));
  }

  private iframeForNodeId?: string;

  attachIframe(node: IframeNode) {
    if (!this.hostEl) return;
    const b = node.getBounds();
    // If already attached to this node, just sync position and return
    if (this.iframeEl && this.iframeForNodeId === node.id) {
      const m = 10;
      const left = b.x + m, top = b.y + m, width = Math.max(10, b.width - m * 2), height = Math.max(10, b.height - m * 2);
      Object.assign(this.iframeEl.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` } as CSSStyleDeclaration);
      return;
    }
    // Otherwise recreate and bind to this node
    this.detachIframe();
    const el = document.createElement('iframe');
    el.src = node.url;
    el.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    el.setAttribute('allowfullscreen', 'true');
    // Inset overlay a bit so canvas handles around edges remain visible and clickable
    const m = 10;
    const left = b.x + m, top = b.y + m, width = Math.max(10, b.width - m * 2), height = Math.max(10, b.height - m * 2);
    const deg = (node.rotation || 0) * 180 / Math.PI;
    Object.assign(el.style, { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, border: 'none', zIndex: '5', pointerEvents: 'none', transform: `rotate(${deg}deg)`, transformOrigin: 'center center' } as CSSStyleDeclaration);
    this.hostEl.appendChild(el); this.iframeEl = el; this.iframeForNodeId = node.id;
  }

  detachIframe() { this.iframeEl?.remove(); this.iframeEl = undefined; this.iframeForNodeId = undefined; }

  setIframeInteractive(on: boolean) {
    if (!this.iframeEl) return;
    this.iframeEl.style.pointerEvents = on ? 'auto' : 'none';
  }

  // Programmatically commit and close the inline textarea editor if open
  commitAndCloseTextarea() {
    const ta = this.textareaEl;
    const node = this.editingTextNode;
    if (!ta) return;
    if (node) { node.text = ta.value; node.requestFit(); }
    // Clear refs before DOM manipulation to avoid re-entrancy with blur handlers
    this.textareaEl = undefined;
    this.editingTextNode = undefined;
    // Safely remove the textarea if it is still in the DOM
    this.safeRemove(ta);
  }

  syncToNode(node: NodeBase) {
    if (!this.hostEl) return;
    if (this.textareaEl && node instanceof TextNode) {
      const b = node.getBounds(); const scaleY = b.height / node.h;
      const deg = (node.rotation || 0) * 180 / Math.PI;
      Object.assign(this.textareaEl.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px`, padding: `${node.padding * scaleY}px`, fontSize: `${Math.min(INLINE_TEXTAREA_MAX_FONT_PX, Math.max(node.style.min, Math.min(node.style.max, (node as any).lastCalculatedFontSize ?? 24)) * scaleY)}px`, transform: `rotate(${deg}deg)`, transformOrigin: 'center center' } as CSSStyleDeclaration);
    }
    if (this.iframeEl && node instanceof IframeNode) {
      const b = node.getBounds();
      const m = 10;
      const left = b.x + m, top = b.y + m, width = Math.max(10, b.width - m * 2), height = Math.max(10, b.height - m * 2);
      const deg = (node.rotation || 0) * 180 / Math.PI;
      Object.assign(this.iframeEl.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, transform: `rotate(${deg}deg)`, transformOrigin: 'center center' } as CSSStyleDeclaration);
    }
  }
}

/* ========================= section: plugins ================================ */
class TextPlugin implements EditorPlugin {
  id = 'text';
  constructor(private readonly fitter: TextFitService) {}
  init(ctx: EditorContext): void {
    // ADD_TEXT
    ctx.bus.commands$.pipe(filter((c) => c.t === 'ADD_TEXT')).subscribe((cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'ADD_TEXT' }>;
      const node = new TextNode(ctx.app, this.fitter);
      node.x = c.x ?? 80; node.y = c.y ?? 80; node.applyBoxSize(c.w ?? 600, c.h ?? 240); node.text = c.text ?? 'New text';
      ctx.world.addChild(node); void node.layout();
      const id = node.id; ctx.store.addNode({ id, type: 'text', ref: node }); ctx.bus.emit({ t: 'SELECT', ids: [id] }); ctx.guides.draw([]);
      const destroy$ = new Subject<void>(); new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(node, destroy$);
      // double-click to edit
      ctx.utils.fromPixi<FederatedPointerEvent>(node, 'pointertap').pipe(filter((e) => e.detail >= 2)).subscribe(() => ctx.overlay.attachTextarea(node));
    });

    // APPLY_STYLE to selected nodes (Text/Brush/Shapes; supports groups)
    ctx.bus.commands$.pipe(filter((c) => c.t === 'APPLY_STYLE')).subscribe((cmd) => {
      const patch = (cmd as Extract<EditorCommand, { t: 'APPLY_STYLE' }>).patch;
      const selected = ctx.store.snapshot(s => s.selectedIds);
      const nodes = ctx.store.snapshot(s => s.nodes);

      const applyToNode = (ref: NodeBase) => {
        if (ref instanceof TextNode) {
          const n = ref;
          if (patch.font) n.style.font = patch.font;
          if (patch.weight) n.style.weight = patch.weight as any;
          if (typeof patch.min === 'number') n.style.min = patch.min;
          if (typeof patch.max === 'number') n.style.max = patch.max;
          if (patch.align) n.style.align = patch.align as Align;
          if (typeof patch.lineHeight === 'number') n.style.lineHeight = patch.lineHeight;
          if (patch.list != null) n.style.list = !!patch.list;
          if ((patch as any).colorHex) { n.style.color = ctx.utils.colorToNumber((patch as any).colorHex); n.style.colorHex = (patch as any).colorHex; }
          n.requestFit(); n.drawHandles();
        } else if (ref instanceof BrushNode) {
          const colorNum = (patch as any).colorHex ? ctx.utils.colorToNumber((patch as any).colorHex) : (ref as BrushNode).stroke;
          const sw = typeof patch.strokeWidth === 'number' ? patch.strokeWidth : (ref as BrushNode).strokeWidth;
          (ref as BrushNode).setStyle(colorNum, sw);
        } else if (ref instanceof ShapeNode) {
          const sn = ref as ShapeNode;
          if ((patch as any).colorHex) { sn.stroke = ctx.utils.colorToNumber((patch as any).colorHex); }
          // Line thickness is locked at 1px for now; ignore strokeWidth for lines
          sn.applyBoxSize(sn.w, sn.h);
        } else if (ref instanceof GroupNode) {
          // Recursively apply to children
          for (const ch of ref.children) {
            if (ch instanceof NodeBase) applyToNode(ch);
          }
        }
      };

      for (const id of selected) {
        const ns = nodes[id];
        if (ns?.ref) applyToNode(ns.ref as NodeBase);
      }
      ctx.store.setUI(patch);
    });
  }
}

class MediaPlugin implements EditorPlugin {
  id = 'media';
  private bgAudio?: HTMLAudioElement;

  init(ctx: EditorContext): void {
    // images
    ctx.bus.commands$.pipe(filter((c) => c.t === 'ADD_IMAGE')).subscribe(async (cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'ADD_IMAGE' }>;
      const node = new ImageNode(c.url);
      node.x = c.x ?? 120; node.y = c.y ?? 100; node.applyBoxSize(c.w ?? 400, c.h ?? 300);
      ctx.world.addChild(node);
      const id = node.id; ctx.store.addNode({ id, type: 'image', ref: node });
      new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(node, new Subject<void>());
      ctx.bus.emit({ t: 'SELECT', ids: [id] });
    });

    // videos
    ctx.bus.commands$.pipe(filter((c) => c.t === 'ADD_VIDEO')).subscribe(async (cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'ADD_VIDEO' }>;
      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)/i.test(c.url ?? '');
      const isVimeo = /vimeo\.com\//i.test(c.url ?? '');
      const toYouTubeEmbed = (url: string) => {
        try {
          const u = new URL(url);
          // youtu.be/<id>
          if (u.hostname.includes('youtu.be')) { return `https://www.youtube-nocookie.com/embed/${u.pathname.replace(/^\//,'')}`; }
          const v = u.searchParams.get('v');
          if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
          // already embed
          const parts = u.pathname.split('/');
          const id = parts[parts.length-1];
          return `https://www.youtube-nocookie.com/embed/${id}`;
        } catch { return url; }
      };
      const toVimeoEmbed = (url: string) => {
        try {
          const u = new URL(url);
          const parts = u.pathname.split('/').filter(Boolean);
          const id = parts[parts.length-1];
          return id ? `https://player.vimeo.com/video/${id}` : url;
        } catch { return url; }
      };

      if (isYouTube || isVimeo) {
        // Use iframe overlay for streaming platforms
        const embedUrl = isYouTube ? toYouTubeEmbed(c.url) : toVimeoEmbed(c.url);
        const node = new IframeNode(embedUrl);
        node.x = c.x ?? 180; node.y = c.y ?? 160; node.applyBoxSize(c.w ?? 640, c.h ?? 360);
        ctx.world.addChild(node);
        const id = node.id; ctx.store.addNode({ id, type: 'iframe', ref: node });
        new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(node, new Subject<void>());
        ctx.overlay.attachIframe(node);
        // enable temporary interaction with double-click
        ctx.utils.fromPixi<FederatedPointerEvent>(node, 'pointertap')
          .pipe(filter((e) => e.detail >= 2))
          .subscribe(() => ctx.overlay.setIframeInteractive(true));
        ctx.bus.emit({ t: 'SELECT', ids: [id] });
      } else {
        const node = new VideoNode(c.url);
        node.x = c.x ?? 160; node.y = c.y ?? 140; node.applyBoxSize(c.w ?? 480, c.h ?? 320);
        ctx.world.addChild(node);
        const id = node.id; ctx.store.addNode({ id, type: 'video', ref: node });
        new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(node, new Subject<void>());
        // double-click to toggle play/pause if underlying HTMLVideoElement is present
        ctx.utils.fromPixi<FederatedPointerEvent>(node, 'pointertap')
          .pipe(filter((e) => e.detail >= 2))
          .subscribe(() => {
            const tex: any = node.sprite.texture as any;
            const res: any = tex?.baseTexture?.resource as any;
            const videoEl: HTMLVideoElement | null = res && res.source instanceof HTMLVideoElement ? (res.source as HTMLVideoElement) : null;
            if (videoEl) { if (videoEl.paused) { videoEl.muted = true; void videoEl.play(); } else { videoEl.pause(); } }
          });
        ctx.bus.emit({ t: 'SELECT', ids: [id] });
      }
    });

    // background audio controls
    ctx.bus.commands$.pipe(filter((c) => c.t === 'SET_AUDIO')).subscribe((cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'SET_AUDIO' }>;
      if (!c.url) { this.bgAudio?.pause(); this.bgAudio = undefined; ctx.store.patchState({ audioUrl: undefined, isPlayingAudio: false }); return; }
      if (!this.bgAudio) this.bgAudio = new Audio();
      this.bgAudio.src = c.url; this.bgAudio.loop = true; this.bgAudio.volume = 0.6; void this.bgAudio.play();
      ctx.store.patchState({ audioUrl: c.url, isPlayingAudio: true });
    });

    ctx.bus.commands$.pipe(filter((c) => c.t === 'PLAY_AUDIO')).subscribe(() => { if (this.bgAudio) { void this.bgAudio.play(); ctx.store.patchState({ isPlayingAudio: true }); } });
    ctx.bus.commands$.pipe(filter((c) => c.t === 'PAUSE_AUDIO')).subscribe(() => { if (this.bgAudio) { this.bgAudio.pause(); ctx.store.patchState({ isPlayingAudio: false }); } });
  }
}

class IframePlugin implements EditorPlugin {
  id = 'iframe';
  init(ctx: EditorContext): void {
    ctx.bus.commands$.pipe(filter((c) => c.t === 'ADD_IFRAME')).subscribe((cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'ADD_IFRAME' }>;
      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)/i.test(c.url ?? '');
      const isVimeo = /vimeo\.com\//i.test(c.url ?? '');
      const toYouTubeEmbed = (url: string) => {
        try {
          const u = new URL(url);
          if (u.hostname.includes('youtu.be')) { return `https://www.youtube-nocookie.com/embed/${u.pathname.replace(/^\\\//,'')}`; }
          const v = u.searchParams.get('v'); if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
          const parts = u.pathname.split('/'); const id = parts[parts.length-1]; return `https://www.youtube-nocookie.com/embed/${id}`;
        } catch { return url; }
      };
      const toVimeoEmbed = (url: string) => {
        try { const u = new URL(url); const parts = u.pathname.split('/').filter(Boolean); const id = parts[parts.length-1]; return id ? `https://player.vimeo.com/video/${id}` : url; } catch { return url; }
      };
      const embedUrl = isYouTube ? toYouTubeEmbed(c.url) : isVimeo ? toVimeoEmbed(c.url) : c.url;
      const node = new IframeNode(embedUrl);
      node.x = c.x ?? 180; node.y = c.y ?? 160; node.applyBoxSize(c.w ?? 640, c.h ?? 360);
      ctx.world.addChild(node);
      const id = node.id; ctx.store.addNode({ id, type: 'iframe', ref: node });
      new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(node, new Subject<void>());
      ctx.overlay.attachIframe(node);
      // enable temporary interaction with double-click
      ctx.utils.fromPixi<FederatedPointerEvent>(node, 'pointertap')
        .pipe(filter((e) => e.detail >= 2))
        .subscribe(() => ctx.overlay.setIframeInteractive(true));
      ctx.bus.emit({ t: 'SELECT', ids: [id] });
    });
  }
}

class ShapesPlugin implements EditorPlugin {
  id = 'shapes';
  init(ctx: EditorContext): void {
    ctx.bus.commands$.pipe(filter((c) => c.t === 'ADD_SHAPE')).subscribe((cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'ADD_SHAPE' }>;
      const node = new ShapeNode(c.shape);
      node.x = c.x; node.y = c.y; node.applyBoxSize(c.w ?? 200, c.shape === 'line' ? 1 : (c.h ?? 120));
      ctx.world.addChild(node);
      const id = node.id; ctx.store.addNode({ id, type: 'shape', ref: node });
      new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(node, new Subject<void>());
      ctx.bus.emit({ t: 'SELECT', ids: [id] });
    });
  }
}

class BrushPlugin implements EditorPlugin {
  id = 'brush';
  private drawing = false;
  private tempNode?: BrushNode;
  private subs: any[] = [];

  init(ctx: EditorContext): void {
    ctx.bus.commands$.pipe(filter((c) => c.t === 'START_BRUSH')).subscribe(() => {
      if (this.drawing) return;
      this.drawing = true;
      const ui = ctx.store.snapshot(s=>s.ui);
      let startWorld: Point | null = null;

      const onDown = (e: FederatedPointerEvent) => {
        if (!this.drawing) return;
        startWorld = ctx.utils.toWorldLocal(e, ctx.world);
        const node = new BrushNode();
        node.x = startWorld.x; node.y = startWorld.y; node.applyBoxSize(1, 1);
        node.setStyle(ui.color || 0xffffff, ui.strokeWidth || 4);
        ctx.world.addChild(node);
        this.tempNode = node;
        // record first point in local space
        node.setPath([new Point(0,0)]);
      };

      const onMove = (e: FederatedPointerEvent) => {
        if (!this.drawing || !this.tempNode || !startWorld) return;
        const p = ctx.utils.toWorldLocal(e, ctx.world);
        const lx = p.x - this.tempNode.x;
        const ly = p.y - this.tempNode.y;
        const current = (this.tempNode as any).path as Point[] | undefined;
        const pts = current && current.length ? [...current, new Point(lx, ly)] : [new Point(lx, ly)];
        this.tempNode.setPath(pts);
        // grow box
        const minX = Math.min(...pts.map(pt=>pt.x));
        const minY = Math.min(...pts.map(pt=>pt.y));
        const maxX = Math.max(...pts.map(pt=>pt.x));
        const maxY = Math.max(...pts.map(pt=>pt.y));
        this.tempNode.x += minX; this.tempNode.y += minY;
        const norm = pts.map(pt=> new Point(pt.x - minX, pt.y - minY));
        this.tempNode.w = Math.max(1, maxX - minX);
        this.tempNode.h = Math.max(1, maxY - minY);
        this.tempNode.setPath(norm);
        this.tempNode.drawHandles();
      };

      const onUp = () => {
        if (!this.drawing || !this.tempNode) return;
        const node = this.tempNode; this.tempNode = undefined;
        this.drawing = false;
        const id = node.id; ctx.store.addNode({ id, type: 'brush', ref: node });
        new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(node, new Subject<void>());
        ctx.bus.emit({ t: 'SELECT', ids: [id] });
        // cleanup events
        ctx.app.stage.off('pointerdown', onDown);
        ctx.app.stage.off('pointermove', onMove);
        ctx.app.stage.off('pointerup', onUp);
        (ctx.app.canvas as any).style.cursor = '';
      };

      // attach temporary listeners
      ctx.app.stage.on('pointerdown', onDown);
      ctx.app.stage.on('pointermove', onMove);
      ctx.app.stage.on('pointerup', onUp);
      (ctx.app.canvas as any).style.cursor = 'crosshair';
    });
  }
}

class GroupingPlugin implements EditorPlugin {
  id = 'grouping';
  init(ctx: EditorContext): void {
    // GROUP
    ctx.bus.commands$.pipe(filter((c) => c.t === 'GROUP')).subscribe((cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'GROUP' }>;
      const ids = c.ids?.length ? c.ids : ctx.store.snapshot(s => s.selectedIds);
      if (ids.length < 2) return;
      const nodesMap = ctx.store.snapshot(s => s.nodes);
      const nodes = ids.map((id) => nodesMap[id]?.ref as NodeBase).filter((n): n is NodeBase => !!n);
      if (!nodes.length) return;

      // Compute enclosing bounds in world space
      const minX = Math.min(...nodes.map((n) => n.x));
      const minY = Math.min(...nodes.map((n) => n.y));
      const maxX = Math.max(...nodes.map((n) => n.x + n.w));
      const maxY = Math.max(...nodes.map((n) => n.y + n.h));

      // Create group and position at top-left of bounds
      const group = new GroupNode();
      group.x = minX; group.y = minY; group.applyBoxSize(maxX - minX, maxY - minY);
      ctx.world.addChild(group);

      // Reparent selected nodes into the group and convert positions to group-local
      for (const n of nodes) {
        // Remove from world if present, then add under group
        try { ctx.world.removeChild(n); } catch { /* ignore */ }
        n.x = n.x - group.x; n.y = n.y - group.y;
        group.addChild(n);
        // Disable child interactivity while grouped; only the group is interactive
        n.eventMode = 'none';
        // Deselect individual nodes; only group will be selected
        if (typeof (n as any).setSelected === 'function') { (n as any).setSelected(false); }
      }

      // Register the group node in the store and select it
      const id = group.id; ctx.store.addNode({ id, type: 'group', ref: group });
      // Bind drag/resize to the group so it moves/resizes as a single block
      new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(group, new Subject<void>());
      ctx.bus.emit({ t: 'SELECT', ids: [id] });
    });

    // UNGROUP
    ctx.bus.commands$.pipe(filter((c) => c.t === 'UNGROUP')).subscribe((cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'UNGROUP' }>;
      const id = c.id ?? ctx.store.snapshot(s => s.selectedIds)[0];
      if (!id) return;
      const group = ctx.store.snapshot(s => s.nodes)[id]?.ref as GroupNode;
      if (!(group instanceof GroupNode)) return;

      // Reparent children back to world coordinates
      const childrenRefs = group.children.filter((c): c is NodeBase => c instanceof NodeBase);
      const childIds = childrenRefs.map((c) => c.id);
      for (const child of childrenRefs) {
        try { group.removeChild(child); } catch { /* ignore */ }
        child.x = child.x + group.x; child.y = child.y + group.y;
        ctx.world.addChild(child);
        // Restore interactivity that was disabled during grouping
        child.eventMode = 'static';
        // If this child is a clone (e.g., came from duplicating a group), it may not be registered/bound yet
        const exists = ctx.store.snapshot(s => s.nodes)[child.id];
        if (!exists) {
          const type = (child as any).type as NodeState['type'];
          ctx.store.addNode({ id: child.id, type: type || 'shape', ref: child });
          new DragResizeService(ctx.cfg, ctx.store, ctx.guides, ctx.world, ctx.app, ctx.bus, ctx.utils, ctx.overlay).bind(child, new Subject<void>());
          // Ensure iframe overlay can be positioned later if needed
          if (child instanceof IframeNode) {
            ctx.overlay.attachIframe(child);
            ctx.overlay.setIframeInteractive(false);
          }
        }
      }

      // Remove the group container and select former children
      ctx.world.removeChild(group);
      ctx.store.removeNode(id);
      ctx.bus.emit({ t: 'SELECT', ids: childIds });
    });
  }
}

class ClipboardPlugin implements EditorPlugin {
  id = 'clipboard';
  init(ctx: EditorContext): void {
    fromEvent<ClipboardEvent>(document, 'paste').subscribe((e) => {
      // Если открыт модальный инпут/textarea или фокус в форме — не перехватываем глобальную вставку
      const ae = document.activeElement as HTMLElement | null;
      const inForm = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      const modalOpen = !!document.querySelector('[data-lyricast-dialog="true"]');
      if (inForm || modalOpen) return;
      const data = e.clipboardData; if (!data) return;
      const items = data.items;
      for (const it of Array.from(items)) {
        if (it.kind === 'file') {
          const file = it.getAsFile(); if (!file) continue;
          if (file.type.startsWith('image/')) { const url = URL.createObjectURL(file); ctx.bus.emit({ t: 'ADD_IMAGE', url, x: 100, y: 100 }); }
        } else if (it.kind === 'string') {
          it.getAsString((s: string) => {
            const str = s.trim();
            // Support base64/data-URL images pasted as text
            if (/^data:image\//i.test(str)) {
              ctx.bus.emit({ t: 'ADD_IMAGE', url: str, x: 120, y: 120 });
              return;
            }
            if (ctx.utils.isUrl(str)) {
              if (ctx.utils.isImageUrl(str)) ctx.bus.emit({ t: 'ADD_IMAGE', url: str, x: 120, y: 120 });
              else if (ctx.utils.isVideoUrl(str)) ctx.bus.emit({ t: 'ADD_VIDEO', url: str });
              else ctx.bus.emit({ t: 'ADD_IFRAME', url: str });
            } else {
              ctx.bus.emit({ t: 'ADD_TEXT', x: 120, y: 120, text: str });
            }
          });
        }
      }
    });
  }
}

/* ========================= section: context-menu.service =================== */
@Injectable()
class ContextMenuService {
  private menuEl?: HTMLDivElement;
  constructor(
    private readonly host: HTMLDivElement,
    private readonly bus: CommandBusService,
    private readonly store: EditorStore,
  ) {}
  private askUrl(title: string): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.dataset['lyricastDialog'] = 'true';
      Object.assign(overlay.style, {
        position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '2000'
      } as CSSStyleDeclaration);
      const panel = document.createElement('div');
      Object.assign(panel.style, {
        background: '#0b1220', color: '#e5e7eb', border: '1px solid #334155', borderRadius: '10px',
        padding: '16px', minWidth: '420px', boxShadow: '0 10px 30px rgba(0,0,0,0.45)'
      } as CSSStyleDeclaration);
      const h = document.createElement('div'); h.textContent = title; h.style.marginBottom = '8px'; h.style.fontWeight = '600';
      const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'https://...';
      fromEvent<ClipboardEvent>(input, 'paste').subscribe((ev) => { ev.stopPropagation(); });
      Object.assign(input.style, { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #475569', outline: 'none', background: '#111827', color: '#e5e7eb' } as CSSStyleDeclaration);
      const row = document.createElement('div'); Object.assign(row.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' } as CSSStyleDeclaration);
      const ok = document.createElement('button'); ok.textContent = 'OK'; Object.assign(ok.style, { padding: '6px 12px', borderRadius: '8px', border: '1px solid #94a3b8', cursor: 'pointer' } as CSSStyleDeclaration);
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; Object.assign(cancel.style, { padding: '6px 12px', borderRadius: '8px', border: '1px solid #94a3b8', cursor: 'pointer' } as CSSStyleDeclaration);
      const closed$ = new Subject<void>();
      const close = (val: string | null) => { closed$.next(); closed$.complete(); overlay.remove(); resolve(val?.trim() ? val.trim() : null); };
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); if (e.key === 'Enter') close(input.value); };
      ok.onclick = () => close(input.value); cancel.onclick = () => close(null);
      row.append(cancel, ok); panel.append(h, input, row); overlay.append(panel); document.body.appendChild(overlay);
      setTimeout(() => input.focus(), 0);
      fromEvent<KeyboardEvent>(window, 'keydown').pipe(takeUntil(closed$)).subscribe(onKey);
    });
  }


  open(x: number, y: number) {
    this.close();
    const el = document.createElement('div');
    el.className = 'ctx-menu';
    const rect = this.host.getBoundingClientRect();
    const left = x - rect.left;
    const top = y - rect.top;
    Object.assign(el.style, {
      position: 'absolute', left: `${left}px`, top: `${top}px`,
      background: '#111827', color: '#e5e7eb',
      border: '1px solid #334155', borderRadius: '8px',
      padding: '6px 0', zIndex: '50', minWidth: '180px',
      boxShadow: '0 8px 20px rgba(0,0,0,0.35)'
    } as CSSStyleDeclaration);

    const menuClosed$ = new Subject<void>();
    const addItem = (label: string, action: () => void) => {
      const i = document.createElement('div'); i.textContent = label;
      Object.assign(i.style, { padding: '8px 12px', cursor: 'pointer', userSelect: 'none' } as CSSStyleDeclaration);
      fromEvent<MouseEvent>(i, 'mouseenter').pipe(takeUntil(menuClosed$)).subscribe(() => i.style.background = '#1f2937');
      fromEvent<MouseEvent>(i, 'mouseleave').pipe(takeUntil(menuClosed$)).subscribe(() => i.style.background = 'transparent');
      fromEvent<MouseEvent>(i, 'click').pipe(takeUntil(menuClosed$)).subscribe(() => { action(); closeLocal(); });
      el.appendChild(i);
    };
    const closeLocal = () => { this.close(); menuClosed$.next(); menuClosed$.complete(); };

    addItem('Add Text', () => this.bus.emit({ t: 'ADD_TEXT', x: 100, y: 80 }));
    addItem('Add Image (URL)', async () => { const url = await this.askUrl('Image URL'); if (url) this.bus.emit({ t: 'ADD_IMAGE', url }); });
    addItem('Add Video (URL)', async () => { const url = await this.askUrl('Video URL'); if (url) this.bus.emit({ t: 'ADD_VIDEO', url }); });
    addItem('Add Iframe (URL)', async () => { const url = await this.askUrl('URL'); if (url) this.bus.emit({ t: 'ADD_IFRAME', url }); });
    addItem('Add Rectangle', () => this.bus.emit({ t: 'ADD_SHAPE', shape: 'rect', x: 120, y: 120 }));
    addItem('Add Ellipse', () => this.bus.emit({ t: 'ADD_SHAPE', shape: 'ellipse', x: 140, y: 140 }));
    addItem('Add Line', () => this.bus.emit({ t: 'ADD_SHAPE', shape: 'line', x: 160, y: 160, w: 220, h: 1 }));

    addItem('Group', () => this.bus.emit({ t: 'GROUP', ids: this.store.snapshot(s => s.selectedIds) }));
    addItem('Ungroup', () => { const id = this.store.snapshot(s => s.selectedIds)[0]; if (id) this.bus.emit({ t: 'UNGROUP', id }); });
    addItem('Duplicate', () => this.bus.emit({ t: 'DUPLICATE' }));
    addItem('Delete', () => this.bus.emit({ t: 'DELETE' }));

    this.host.appendChild(el); this.menuEl = el;

    setTimeout(() => {
      fromEvent<MouseEvent>(document, 'click')
        .pipe(first(), takeUntil(menuClosed$))
        .subscribe(() => closeLocal());
      fromEvent<KeyboardEvent>(document, 'keydown')
        .pipe(filter((e) => e.key === 'Escape'), first(), takeUntil(menuClosed$))
        .subscribe(() => closeLocal());
    }, 0);
  }

  close() { this.menuEl?.remove(); this.menuEl = undefined; }

  // Simple DOM-based url prompt (Electron-safe)

}

/* ========================= section: editor.component ======================= */
@Component({
  selector: 'pixi-slide-editor-v2',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    { provide: EDITOR_CONFIG, useValue: DEFAULT_CONFIG },
    EditorStore,
    CommandBusService,
    EditorUtilsService,
    OverlayService,
  ],
  template: `
    <ng-container *ngIf="vm$ | async as vm">
      <div class="toolbar">
        <button (click)="emit({ t: 'ADD_TEXT', x: 100, y: 80 })">Text</button>
        <button (click)="onImageUrl()">Image</button>
        <button (click)="onVideoUrl()">Video</button>
        <button (click)="onIframeUrl()">Iframe</button>
        <span class="sep"></span>

        <button
          (click)="emit({ t: 'ADD_SHAPE', shape: 'rect', x: 120, y: 120 })"
        >
          Rect
        </button>
        <button
          (click)="emit({ t: 'ADD_SHAPE', shape: 'ellipse', x: 140, y: 140 })"
        >
          Ellipse
        </button>
        <button
          (click)="
            emit({
              t: 'ADD_SHAPE',
              shape: 'line',
              x: 160,
              y: 160,
              w: 220,
              h: 1
            })
          "
        >
          Line
        </button>
        <button (click)="emit({ t: 'START_BRUSH' })">Brush</button>
        <span class="sep"></span>

        <button
          (click)="emit({ t: 'GROUP', ids: vm.selectedIds })"
          [disabled]="(vm.selectedIds?.length || 0) < 2"
        >
          Group
        </button>
        <button
          (click)="onUngroup()"
          [disabled]="(vm.selectedIds?.length || 0) !== 1"
        >
          Ungroup
        </button>
        <button
          (click)="emit({ t: 'DUPLICATE' })"
          [disabled]="!vm.selectedIds?.length"
        >
          Duplicate
        </button>
        <button
          (click)="emit({ t: 'DELETE' })"
          [disabled]="!vm.selectedIds?.length"
        >
          Delete
        </button>
        <span class="sep"></span>

        <label
          >Zoom
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.05"
            [ngModel]="vm.zoom"
            (ngModelChange)="emit({ t: 'ZOOM', z: $event })"
          />
        </label>
        <label>
          <input
            type="checkbox"
            [ngModel]="vm.snapEnabled"
            (ngModelChange)="emit({ t: 'SNAP', on: $event })"
          />
          Grid snap
        </label>
        <label>
          <input
            type="checkbox"
            [ngModel]="vm.guidesEnabled"
            (ngModelChange)="emit({ t: 'GUIDES', on: $event })"
          />
          Guides
        </label>

        <span class="sep"></span>
        <label
          >Font
          <select
            [ngModel]="vm.ui.font"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { font: $event } })
            "
          >
            <option>Inter, system-ui, sans-serif</option>
            <option>Arial, Helvetica, sans-serif</option>
            <option>Georgia, serif</option>
            <option>'Times New Roman', Times, serif</option>
            <option>'Segoe UI', Tahoma, Geneva, Verdana, sans-serif</option>
          </select>
        </label>
        <label
          >Weight
          <select
            [ngModel]="vm.ui.weight"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { weight: $event } })
            "
          >
            <option value="400">400</option>
            <option value="500">500</option>
            <option value="600">600</option>
            <option value="700">700</option>
            <option value="800">800</option>
          </select>
        </label>
        <label
          >Color
          <input
            type="color"
            [ngModel]="vm.ui.colorHex"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { colorHex: $event } })
            "
          />
        </label>
        <label>
          Stroke
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            [ngModel]="vm.ui.strokeWidth"
            (ngModelChange)="emit({ t: 'APPLY_STYLE', patch: { strokeWidth: +$event } })"
          />
        </label>
        <label
          >Align
          <select
            [ngModel]="vm.ui.align"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { align: $event } })
            "
          >
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </label>
        <label
          >Line
          <input
            type="range"
            min="1"
            max="1.8"
            step="0.02"
            [ngModel]="vm.ui.lineHeight"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { lineHeight: +$event } })
            "
          />
        </label>
        <label
          >Min
          <input
            type="number"
            min="6"
            max="300"
            step="1"
            [ngModel]="vm.ui.min"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { min: +$event } })
            "
          />
        </label>
        <label
          >Max
          <input
            type="number"
            min="10"
            max="400"
            step="1"
            [ngModel]="vm.ui.max"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { max: +$event } })
            "
          />
        </label>
        <label>
          <input
            type="checkbox"
            [ngModel]="vm.ui.list"
            (ngModelChange)="
              emit({ t: 'APPLY_STYLE', patch: { list: !!$event } })
            "
          />
          Bulleted
        </label>

      </div>

    </ng-container>
    <div class="host" #host (contextmenu)="onContextMenu($event)"></div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        position: relative;
        height: 100%;
        min-height: 560px;
        font: 14px system-ui;
      }
      .host {
        position: absolute;
        top: 170px;
        bottom: 0;
        left: 0;
        right: 0;
      }
      .toolbar {
        color: black;
        position: relative;
        left: 12px;
        top: 8px;
        right: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 6px 10px;
        z-index: 2;
      }
      .sep {
        width: 1px;
        height: 22px;
        background: #e5e7eb;
        display: inline-block;
      }
      button {
        border: 1px solid #cbd5e1;
        background: #fff;
        border-radius: 8px;
        padding: 4px 10px;
        cursor: pointer;
        color: black;
      }
      label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
    `,
  ],
})
export class PixiSlideEditorV2Component
  implements OnInit, AfterViewInit, OnDestroy
{
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  readonly cfg = inject(EDITOR_CONFIG);
  readonly store = inject(EditorStore);
  readonly bus = inject(CommandBusService);
  readonly utils = inject(EditorUtilsService);
  readonly overlay = inject(OverlayService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  app!: Application;
  world!: Container & { app: Application };
  grid!: TilingSprite;
  guides!: GuideLayer;
  private readonly textFit = inject(TextFitService);

  // Plugin instances (can be DI-driven later)
  private plugins: EditorPlugin[] = [
    new TextPlugin(inject(TextFitService)),
    new MediaPlugin(),
    new IframePlugin(),
    new ShapesPlugin(),
    new BrushPlugin(),
    new GroupingPlugin(),
    new ClipboardPlugin(),
  ];

  vm$ = this.store.select((s) => s);

  private destroy$ = new Subject<void>();
  private ctxMenu?: ContextMenuService;

  ngOnInit() {}
  ngAfterViewInit(): void {
    void this.initPixi();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.app?.destroy(true);
  }

  private async initPixi() {
    const app = new Application();
    await app.init({
      resizeTo: this.hostRef.nativeElement,
      background: this.cfg.background,
      antialias: true,
      resolution: 1,
    });
    this.hostRef.nativeElement.appendChild(app.canvas);

    const world = new Container() as Container & { app: Application };
    (world as any).app = app;
    app.stage.addChild(world);

    const gridTexture = this.createGridTexture(
      this.cfg.grid.size,
      this.cfg.grid.line,
      this.cfg.grid.alpha
    );
    const grid = new TilingSprite({
      texture: gridTexture,
      width: app.renderer.width,
      height: app.renderer.height,
    });
    world.addChild(grid);

    this.app = app;
    this.world = world;
    this.grid = grid;

    // Guides layer
    this.guides = new GuideLayer(this.world, this.cfg);
    this.world.addChild(this.guides);

    // Overlay host
    this.overlay.setHost(this.hostRef.nativeElement);

    // Stage click to deselect (and commit any open textarea editor)
    this.app.stage.eventMode = 'static';
    this.utils
      .fromPixi<FederatedPointerEvent>(this.app.stage, 'pointerdown')
      .pipe(
        tap((e) => e.preventDefault()),
        filter((e) => e.target === this.app.stage),
        takeUntil(this.destroy$)
      )
      .subscribe(() => { this.overlay.commitAndCloseTextarea(); this.bus.emit({ t: 'SELECT', ids: [] }); });

    // Context menu at cursor (RxJS)
    const host = this.hostRef.nativeElement as HTMLDivElement;
    fromEvent<MouseEvent>(host, 'contextmenu')
      .pipe(takeUntil(this.destroy$))
      .subscribe((ev) => {
        ev.preventDefault();
        // If an iframe is selected and the right-click is inside it, enable interaction instead of opening menu
        const selectedId = this.store.snapshot((s) => s.selectedIds)[0];
        if (selectedId) {
          const ref = this.store.snapshot((s) => s.nodes)[selectedId]?.ref as NodeBase;
          if (ref instanceof IframeNode) {
            const b = ref.getBounds();
            const hostRect = host.getBoundingClientRect();
            const x = ev.clientX - hostRect.left;
            const y = ev.clientY - hostRect.top;
            const m = 10; // same inset as overlay
            if (x >= b.x + m && x <= b.x + b.width - m && y >= b.y + m && y <= b.y + b.height - m) {
              this.overlay.attachIframe(ref);
              this.overlay.setIframeInteractive(true);
              return; // do not open context menu
            }
          }
        }
        this.ctxMenu?.open(ev.clientX, ev.clientY);
      });

    // Hotkeys: Delete to remove, Esc to deselect (when not typing in inputs)
    fromEvent<KeyboardEvent>(window, 'keydown')
      .pipe(takeUntil(this.destroy$))
      .subscribe((ev) => {
        const tag = (ev.target as HTMLElement | null)?.tagName;
        const editable = (ev.target as HTMLElement | null)?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
        // Select all: Ctrl/Cmd + A using layout-agnostic code
        if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyA') {
          ev.preventDefault();
          const topLevelIds = this.world.children
            .filter((c: any) => c instanceof NodeBase)
            .map((c: any) => (c as NodeBase).id);
          this.bus.emit({ t: 'SELECT', ids: topLevelIds });
          return;
        }
        if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); this.bus.emit({ t: 'DELETE' }); }
        if (ev.key === 'Escape') { ev.preventDefault(); this.bus.emit({ t: 'SELECT', ids: [] }); }
      });

    // Keep grid size on resize
    fromEvent(window, 'resize')
      .pipe(auditTime(0), takeUntil(this.destroy$))
      .subscribe(() => {
        this.grid.width = this.app.renderer.width;
        this.grid.height = this.app.renderer.height;
      });

    // Global command handlers
    this.bus.commands$
      .pipe(filter((c) => c.t === 'SELECT'))
      .subscribe((cmd) => {
        const c = cmd as Extract<EditorCommand, { t: 'SELECT' }>;
        this.store.setSelection(c.ids);

        // Toggle selection visuals on all nodes
        const all = this.store.snapshot((s) => s.nodes);
        const selSet = new Set(c.ids || []);
        for (const id of Object.keys(all)) {
          const ref = all[id]?.ref as any;
          if (ref && typeof ref.setSelected === 'function') {
            ref.setSelected(selSet.has(id));
          }
        }

        // Update UI toolbar to reflect selected node(s)
        const updateUIFromSelection = () => {
          const ids = c.ids || [];
          if (!ids.length) return;
          const firstId = ids[0];
          const ref = this.store.snapshot((s) => s.nodes)[firstId]?.ref as NodeBase | undefined;
          const pickTextFrom = (node?: NodeBase): TextNode | undefined => {
            if (!node) return undefined;
            if (node instanceof TextNode) return node;
            if (node instanceof GroupNode) {
              for (const ch of node.children) {
                if (ch instanceof TextNode) return ch;
                if (ch instanceof GroupNode) { const found = pickTextFrom(ch); if (found) return found; }
              }
            }
            return undefined;
          };
          const tn = pickTextFrom(ref);
          if (tn) {
            this.store.setUI({
              font: tn.style.font,
              weight: tn.style.weight,
              color: tn.style.color,
              colorHex: tn.style.colorHex,
              align: tn.style.align,
              lineHeight: tn.style.lineHeight,
              min: tn.style.min,
              max: tn.style.max,
              list: tn.style.list,
            });
          } else if (ref instanceof BrushNode) {
            this.store.setUI({
              color: (ref as BrushNode).stroke,
              colorHex: this.utils.numberToHex((ref as BrushNode).stroke),
              strokeWidth: (ref as BrushNode).strokeWidth,
            });
          } else if (ref instanceof ShapeNode) {
            const sn = ref as ShapeNode;
            const sw = sn.shape === 'line' ? 1 : (this.store.snapshot(s=>s.ui).strokeWidth || 4);
            this.store.setUI({
              color: sn.stroke,
              colorHex: this.utils.numberToHex(sn.stroke),
              strokeWidth: sw,
            });
          }
        };
        updateUIFromSelection();

        // For iframe nodes: do not recreate/detach on selection changes; just ensure it's attached and non-interactive
        const selectedId = c.ids?.length === 1 ? c.ids[0] : undefined;
        if (selectedId) {
          const ref = this.store.snapshot((s) => s.nodes)[selectedId]?.ref as NodeBase;
          if (ref instanceof IframeNode) {
            this.overlay.attachIframe(ref);
            this.overlay.setIframeInteractive(false);
          } else {
            // If selecting something else, keep existing iframe overlay visible (no detach), but ensure it is non-interactive
            this.overlay.setIframeInteractive(false);
          }
        } else {
          // Deselect: keep iframe content visible; ensure it's non-interactive
          this.overlay.setIframeInteractive(false);
        }
        this.cdr.detectChanges();
      });

    this.bus.commands$.pipe(filter((c) => c.t === 'ZOOM')).subscribe((cmd) => {
      const c = cmd as Extract<EditorCommand, { t: 'ZOOM' }>;
      this.store.setZoom(c.z);
      this.world.scale.set(c.z);
      this.guides.draw([]);
      const sel = this.store.snapshot((s) => s.selectedIds)[0];
      if (sel) {
        const ref = this.store.snapshot((s) => s.nodes)[sel]?.ref as NodeBase;
        if (ref) this.overlay.syncToNode(ref);
      }
    });

    this.bus.commands$
      .pipe(filter((c) => c.t === 'SNAP'))
      .subscribe((cmd) => this.store.setSnap((cmd as any).on));
    this.bus.commands$
      .pipe(filter((c) => c.t === 'GUIDES'))
      .subscribe((cmd) => {
        const on = (cmd as any).on;
        this.store.setGuides(on);
        this.guides.enabled = on;
        this.guides.draw([]);
      });

    this.bus.commands$.pipe(filter((c) => c.t === 'DELETE')).subscribe(() => {
      const ids = this.store.snapshot((s) => s.selectedIds);
      const nodes = this.store.snapshot((s) => s.nodes);
      for (const id of ids) {
        const ref = nodes[id]?.ref;
        if (ref) {
          if (ref instanceof IframeNode) { this.overlay.detachIframe(); }
          this.world.removeChild(ref);
          (ref as any).destroy?.({ children: true });
        }
        this.store.removeNode(id);
      }
      this.bus.emit({ t: 'SELECT', ids: [] });
    });

    this.bus.commands$
      .pipe(filter((c) => c.t === 'DUPLICATE'))
      .subscribe(() => {
        const ids = this.store.snapshot((s) => s.selectedIds);
        const nodes = this.store.snapshot((s) => s.nodes);
        const newIds: string[] = [];
        for (const id of ids) {
          const ns = nodes[id];
          if (!ns) continue;
          const ref = ns.ref as NodeBase;
          const clone = this.cloneNode(ref);
          if (!clone) continue;
          clone.x = ref.x + 24;
          clone.y = ref.y + 24;
          this.world.addChild(clone);
          this.store.addNode({ id: clone.id, type: (clone as any).type || ns.type, ref: clone });
          new DragResizeService(
            this.cfg,
            this.store,
            this.guides,
            this.world,
            this.app,
            this.bus,
            this.utils,
            this.overlay
          ).bind(clone, new Subject<void>());
          newIds.push(clone.id);
        }
        if (newIds.length) this.bus.emit({ t: 'SELECT', ids: newIds });
      });

    // Initialize plugins
    const ctx: EditorContext = {
      app: this.app,
      world: this.world,
      store: this.store,
      bus: this.bus,
      utils: this.utils,
      overlay: this.overlay,
      guides: this.guides,
      cfg: this.cfg,
    };
    this.plugins.forEach((p) => p.init(ctx));

    // Demo nodes (optional)
    this.bus.emit({
      t: 'ADD_TEXT',
      x: 120,
      y: 100,
      text: 'Благодать Твоя, как река, Наполняет сердце моё…',
    });
    this.bus.emit({
      t: 'ADD_TEXT',
      x: 180,
      y: 380,
      text: 'В Твоих я покоюсь руках.',
    });

    // Context menu
    this.ctxMenu = new ContextMenuService(
      this.hostRef.nativeElement,
      this.bus,
      this.store
    );
  }

  private createGridTexture(size = 20, line = 1, alpha = 0.08) {
    const cvs = document.createElement('canvas');
    cvs.width = size;
    cvs.height = size;
    const ctx = cvs.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(size - line, 0, line, size);
    ctx.fillRect(0, size - line, size, line);
    return Texture.from(cvs);
  }

  private cloneNode(src: NodeBase): NodeBase | null {
    if (src instanceof TextNode) {
      const n = new TextNode(this.app, this.textFit);
      n.text = src.text;
      n.style = { ...src.style };
      n.applyBoxSize(src.w, src.h);
      n.requestFit();
      return n;
    }
    if (src instanceof ImageNode) {
      const n = new ImageNode();
      n.applyBoxSize(src.w, src.h);
      n.sprite.texture = (src as ImageNode).sprite.texture;
      n.sprite.anchor.set(0.5);
      n.sprite.position.set(n.w / 2, n.h / 2);
      n.sprite.scale.set((src as ImageNode).sprite.scale.x);
      return n;
    }
    if (src instanceof VideoNode) {
      const n = new VideoNode();
      n.applyBoxSize(src.w, src.h);
      n.sprite.texture = (src as VideoNode).sprite.texture;
      n.sprite.anchor.set(0.5);
      n.sprite.position.set(n.w / 2, n.h / 2);
      n.sprite.scale.set((src as VideoNode).sprite.scale.x);
      return n;
    }
    if (src instanceof IframeNode) {
      const n = new IframeNode(src.url);
      n.applyBoxSize(src.w, src.h);
      return n;
    }
    if (src instanceof GroupNode) {
      // Deep-clone group with its children (as a new independent block)
      const childClones: NodeBase[] = [];
      const g = new GroupNode();
      g.applyBoxSize(src.w, src.h);
      // Clone each child, keep relative position
      for (const ch of src.children) {
        if (!(ch instanceof NodeBase)) continue;
        const c = this.cloneNode(ch);
        if (!c) continue;
        c.x = ch.x; c.y = ch.y; c.eventMode = 'none';
        g.addChild(c);
        childClones.push(c);
      }
      return g;
    }
    if (src instanceof ShapeNode) {
      const n = new ShapeNode(src.shape);
      n.fill = src.fill;
      n.stroke = src.stroke;
      n.lineWidth = src.lineWidth;
      n.applyBoxSize(src.w, src.h);
      return n;
    }
    if (src instanceof BrushNode) {
      const n = new BrushNode();
      n.stroke = src.stroke;
      n.strokeWidth = src.strokeWidth;
      n.applyBoxSize(src.w, src.h);
      // copy path by sampling from src's private path via bounding box using toLocal? We stored via setPath; use (src as any).path
      const pts: Point[] = ((src as any).path || []).map((p: Point) => new Point(p.x, p.y));
      n.setPath(pts);
      return n;
    }
    return null;
  }

  emit(cmd: EditorCommand) {
    this.bus.emit(cmd);
  }

  private askUrl(title: string): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.dataset['lyricastDialog'] = 'true';
      Object.assign(overlay.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        right: '0',
        bottom: '0',
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '2000',
      } as CSSStyleDeclaration);
      const panel = document.createElement('div');
      Object.assign(panel.style, {
        background: '#0b1220',
        color: '#e5e7eb',
        border: '1px solid #334155',
        borderRadius: '10px',
        padding: '16px',
        minWidth: '420px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
      } as CSSStyleDeclaration);
      const h = document.createElement('div');
      h.textContent = title;
      h.style.marginBottom = '8px';
      h.style.fontWeight = '600';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'https://...';
      fromEvent<ClipboardEvent>(input, 'paste').subscribe((ev) => {
        ev.stopPropagation();
      });
      Object.assign(input.style, {
        width: '100%',
        padding: '8px 10px',
        borderRadius: '8px',
        border: '1px solid #475569',
        outline: 'none',
        background: '#111827',
        color: '#e5e7eb',
      } as CSSStyleDeclaration);
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        marginTop: '12px',
      } as CSSStyleDeclaration);
      const ok = document.createElement('button');
      ok.textContent = 'OK';
      Object.assign(ok.style, {
        padding: '6px 12px',
        borderRadius: '8px',
        border: '1px solid #94a3b8',
        cursor: 'pointer',
      } as CSSStyleDeclaration);
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      Object.assign(cancel.style, {
        padding: '6px 12px',
        borderRadius: '8px',
        border: '1px solid #94a3b8',
        cursor: 'pointer',
      } as CSSStyleDeclaration);
      const closed$ = new Subject<void>();
      const close = (val: string | null) => {
        closed$.next();
        closed$.complete();
        overlay.remove();
        resolve(val?.trim() ? val.trim() : null);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') close(input.value);
      };
      ok.onclick = () => close(input.value);
      cancel.onclick = () => close(null);
      row.append(cancel, ok);
      panel.append(h, input, row);
      overlay.append(panel);
      document.body.appendChild(overlay);
      setTimeout(() => input.focus(), 0);
      fromEvent<KeyboardEvent>(window, 'keydown').pipe(takeUntil(closed$)).subscribe(onKey);
    });
  }

  async onImageUrl() {
    const url = await this.askUrl('Image URL');
    if (url) this.emit({ t: 'ADD_IMAGE', url });
  }
  async onVideoUrl() {
    const url = await this.askUrl('Video URL');
    if (url) this.emit({ t: 'ADD_VIDEO', url });
  }
  async onIframeUrl() {
    const url = await this.askUrl('URL to embed');
    if (url) this.emit({ t: 'ADD_IFRAME', url });
  }
  onUngroup() {
    const id = this.store.snapshot((s) => s.selectedIds)[0];
    if (id) this.emit({ t: 'UNGROUP', id });
  }

  onContextMenu(e: MouseEvent) {
    e.preventDefault();
    this.ctxMenu?.open(e.clientX, e.clientY);
  }
}

/* ========================= section: test host component ==================== */
@Component({ selector: 'lyri-test-pixi-editor-v2', standalone: true, imports: [CommonModule, PixiSlideEditorV2Component], template: `<pixi-slide-editor-v2/>` })
export class TestPixiEditorV2Component {}

/* ========================= section: LEGACY KEEP ============================
// Вставь сюда предыдущий файл редактора целиком, но под комментами, чтобы
// ничего не потерять и можно было сравнивать/откатываться по фрагментам.
*/
