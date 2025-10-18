import { Injectable } from '@angular/core';
import { fromEvent, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EditorStore } from './editor-store.service';
import { INLINE_TEXTAREA_MAX_FONT_PX } from '../types';
import { TextNode, IframeNode } from '../nodes';
import { NodeBase } from '../core';

@Injectable()
export class OverlayService {
  private hostEl?: HTMLDivElement;
  private textareaEl?: HTMLTextAreaElement;
  private iframeEl?: HTMLIFrameElement;

  constructor(private readonly store: EditorStore) {}

  setHost(element: HTMLDivElement) { this.hostEl = element; }

  private safeRemove(el?: Element | null) {
    try {
      if (!el) return;
      const parent = el.parentNode as (Node & ParentNode) | null;
      if (parent) {
        try { parent.removeChild(el); } catch { /* ignore */ }
      } else {
        try { (el as Element).remove(); } catch { /* ignore */ }
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
      fontFamily: node.style.font, fontWeight: node.style.weight,
      fontSize: `${Math.min(INLINE_TEXTAREA_MAX_FONT_PX, Math.max(node.style.min, Math.min(node.style.max, node.currentFontSize ?? 24)) * scaleY)}px`,
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
    fromEvent<ClipboardEvent>(ta, 'paste').pipe(takeUntil(done$)).subscribe((ev) => ev.stopPropagation());
    fromEvent<FocusEvent>(ta, 'blur').pipe(takeUntil(done$)).subscribe(() => finish(true));
  }

  private iframeForNodeId?: string;

  attachIframe(node: IframeNode) {
    if (!this.hostEl) return;
    const b = node.getBounds();
    if (this.iframeEl && this.iframeForNodeId === node.id) {
      const m = 10;
      const left = b.x + m, top = b.y + m, width = Math.max(10, b.width - m * 2), height = Math.max(10, b.height - m * 2);
      Object.assign(this.iframeEl.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` } as CSSStyleDeclaration);
      return;
    }
    this.detachIframe();
    const el = document.createElement('iframe');
    el.src = node.url;
    el.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    el.setAttribute('allowfullscreen', 'true');
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

  commitAndCloseTextarea() {
    const ta = this.textareaEl;
    const node = this.editingTextNode;
    if (!ta) return;
    if (node) { node.text = ta.value; node.requestFit(); }
    this.textareaEl = undefined;
    this.editingTextNode = undefined;
    this.safeRemove(ta);
  }

  syncToNode(node: NodeBase) {
    if (!this.hostEl) return;
    if (this.textareaEl && node instanceof TextNode) {
      const b = node.getBounds(); const scaleY = b.height / node.h;
      const deg = (node.rotation || 0) * 180 / Math.PI;
      Object.assign(this.textareaEl.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px`, padding: `${node.padding * scaleY}px`, fontSize: `${Math.min(INLINE_TEXTAREA_MAX_FONT_PX, Math.max(node.style.min, Math.min(node.style.max, node.currentFontSize ?? 24)) * scaleY)}px`, transform: `rotate(${deg}deg)`, transformOrigin: 'center center' } as CSSStyleDeclaration);
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
