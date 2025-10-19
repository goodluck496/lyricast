import { fromEvent, Subject } from 'rxjs';
import { filter, first, takeUntil } from 'rxjs/operators';

// Minimal interfaces to decouple from the monolithic file
export interface NodeStateLike { id: string; type: 'text'|'image'|'video'|'iframe'|'shape'|'group'|'brush' }
export interface EditorStateLike { selectedIds: string[]; nodes: Record<string, NodeStateLike> }
export interface EditorStoreLike {
  snapshot<T>(selector: (s: EditorStateLike) => T): T;
}
export interface CommandBusLike {
  emit(cmd: unknown): void;
}

export class ContextMenuService {
  private menuEl?: HTMLDivElement;
  constructor(
    private readonly host: HTMLDivElement,
    private readonly bus: CommandBusLike,
    private readonly store: EditorStoreLike,
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

    const hasSelection = (this.store.snapshot(s => s.selectedIds)?.length || 0) > 0;
    if (!hasSelection) {
      addItem('Add Text', () => this.bus.emit({ t: 'ADD_TEXT', x: 100, y: 80 }));
      addItem('Add Image (URL)', async () => { const url = await this.askUrl('Image URL'); if (url) this.bus.emit({ t: 'ADD_IMAGE', url }); });
      addItem('Add Video (URL)', async () => { const url = await this.askUrl('Video URL'); if (url) this.bus.emit({ t: 'ADD_VIDEO', url }); });
      addItem('Add Iframe (URL)', async () => { const url = await this.askUrl('URL'); if (url) this.bus.emit({ t: 'ADD_IFRAME', url }); });
      addItem('Add Rectangle', () => this.bus.emit({ t: 'ADD_SHAPE', shape: 'rect', x: 120, y: 120 }));
      addItem('Add Ellipse', () => this.bus.emit({ t: 'ADD_SHAPE', shape: 'ellipse', x: 140, y: 140 }));
      addItem('Add Line', () => this.bus.emit({ t: 'ADD_SHAPE', shape: 'line', x: 160, y: 160, w: 220, h: 1 }));
      const sepAdd = document.createElement('div'); Object.assign(sepAdd.style, { borderTop: '1px solid #334155', margin: '6px 0' } as CSSStyleDeclaration);
      el.appendChild(sepAdd);
    }

    const selection = this.store.snapshot(s => s.selectedIds) || [];
    if (selection.length >= 2) {
      addItem('Group', () => this.bus.emit({ t: 'GROUP', ids: selection }));
    }
    const selectedId = selection.length === 1 ? selection[0] : undefined;
    const selectedType = selectedId ? this.store.snapshot(s => s.nodes)[selectedId]?.type : undefined;
    const isGroup = selectedType === 'group';
    if (isGroup) {
      addItem('Ungroup', () => { if (selectedId) this.bus.emit({ t: 'UNGROUP', id: selectedId }); });
    }
    // Background actions for shapes and text
    if (selectedType === 'shape') {
      addItem('Set background image…', async () => { const url = await this.askUrl('Background image URL / data:'); if (url) this.bus.emit({ t: 'SET_SHAPE_BACKGROUND', url }); });
      addItem('Clear background', () => this.bus.emit({ t: 'CLEAR_SHAPE_BACKGROUND' }));
    } else if (selectedType === 'text') {
      addItem('Set background image…', async () => { const url = await this.askUrl('Background image URL / data:'); if (url) this.bus.emit({ t: 'SET_TEXT_BACKGROUND', url }); });
      addItem('Clear background', () => this.bus.emit({ t: 'CLEAR_TEXT_BACKGROUND' }));
    }
    addItem('Duplicate', () => this.bus.emit({ t: 'DUPLICATE' }));
    addItem('Delete', () => this.bus.emit({ t: 'DELETE' }));

    // Z-index controls
    const sep = document.createElement('div'); Object.assign(sep.style, { borderTop: '1px solid #334155', margin: '6px 0' } as CSSStyleDeclaration);
    el.appendChild(sep);
    const safeAdd = (label: string, action: () => void) => addItem(label, () => { if (hasSelection) action(); });
    safeAdd('Bring forward', () => this.bus.emit({ t: 'BRING_FORWARD' }));
    safeAdd('Send backward', () => this.bus.emit({ t: 'SEND_BACKWARD' }));

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
}
