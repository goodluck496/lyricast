import { Injectable } from '@angular/core';
import { EditorContext, EditorPlugin } from '../core';
import { fromEvent, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * ClipboardPlugin listens for global paste events and routes content to the proper ADD_* command.
 *
 * Behavior:
 * - If focus is inside an input/textarea or a modal dialog is open, it does nothing.
 * - Files: image files are pasted as ADD_IMAGE with a temporary blob URL.
 * - Strings: data:image/* data-URLs become images; URLs are routed to image/video/iframe; otherwise added as text.
 */
@Injectable()
export class ClipboardPlugin implements EditorPlugin {
  id = 'clipboard';
  private destroy$ = new Subject<void>();

  init(ctx: EditorContext): void {
    fromEvent<ClipboardEvent>(document, 'paste').pipe(takeUntil(this.destroy$)).subscribe((event) => {
      // Если открыт модальный инпут/textarea или фокус в форме — не перехватываем глобальную вставку
      const active = document.activeElement as HTMLElement | null;
      const focusInForm = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      const modalOpen = !!document.querySelector('[data-lyricast-dialog="true"]');
      if (focusInForm || modalOpen) return;

      const clipboard = event.clipboardData; if (!clipboard) return;
      const items = clipboard.items;
      let imageProcessed = false; // Флаг для отслеживания обработки изображения
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile(); if (!file) continue;
          if (file.type.startsWith('image/')) {
            imageProcessed = true; // Отмечаем, что изображение обработано
            const url = URL.createObjectURL(file);
            const sel = ctx.store.snapshot(s => s.selectedIds) || [];
            const nodes = ctx.store.snapshot(s => s.nodes);
            const hasTextSel = sel.some(id => nodes[id]?.type === 'text');
            const hasShapeSel = sel.some(id => nodes[id]?.type === 'shape');
            const hasBrushSel = sel.some(id => nodes[id]?.type === 'brush');
            ctx.utils.urlToBase64(url).then(base64Url => {
              if (hasTextSel) {
                ctx.bus.emit({ t: 'SET_TEXT_BACKGROUND', url: base64Url });
              } else if (hasShapeSel) {
                ctx.bus.emit({ t: 'SET_SHAPE_BACKGROUND', url: base64Url });
              } else if (hasBrushSel) {
                ctx.bus.emit({ t: 'SET_BRUSH_BACKGROUND', url: base64Url });
              } else {
                ctx.bus.emit({ t: 'ADD_IMAGE', url: base64Url, x: 100, y: 100 });
              }
            });
          }
        } else if (item.kind === 'string') {
          item.getAsString(async (raw) => {
            // Если изображение уже обработано, игнорируем HTML/текст из буфера
            if (imageProcessed) return;

            const str = raw.trim();
            // Игнорируем HTML-фрагменты с изображениями (они приходят вместе с file)
            if (/^<html>|<!--StartFragment-->/.test(str) && /<img\s+src=/.test(str)) {
              return;
            }

            // Support base64/data-URL images pasted as text
            if (/^data:image\//i.test(str)) {
              const sel = ctx.store.snapshot(s => s.selectedIds) || [];
              const nodes = ctx.store.snapshot(s => s.nodes);
              const hasTextSel = sel.some(id => nodes[id]?.type === 'text');
              const hasShapeSel = sel.some(id => nodes[id]?.type === 'shape');
              const hasBrushSel = sel.some(id => nodes[id]?.type === 'brush');
              if (hasTextSel) {
                ctx.bus.emit({ t: 'SET_TEXT_BACKGROUND', url: str });
              } else if (hasShapeSel) {
                ctx.bus.emit({ t: 'SET_SHAPE_BACKGROUND', url: str });
              } else if (hasBrushSel) {
                ctx.bus.emit({ t: 'SET_BRUSH_BACKGROUND', url: str });
              } else {
                ctx.bus.emit({ t: 'ADD_IMAGE', url: str, x: 120, y: 120 });
              }
              return;
            }
            if (ctx.utils.isUrl(str)) {
              if (ctx.utils.isImageUrl(str)) {
                const base64Url = await ctx.utils.urlToBase64(str);
                const sel = ctx.store.snapshot(s => s.selectedIds) || [];
                const nodes = ctx.store.snapshot(s => s.nodes);
                const hasShapeSel = sel.some(id => nodes[id]?.type === 'shape');
                const hasBrushSel = sel.some(id => nodes[id]?.type === 'brush');
                if (hasShapeSel) {
                  ctx.bus.emit({ t: 'SET_SHAPE_BACKGROUND', url: base64Url });
                } else if (hasBrushSel) {
                  ctx.bus.emit({ t: 'SET_BRUSH_BACKGROUND', url: base64Url });
                } else {
                  ctx.bus.emit({ t: 'ADD_IMAGE', url: base64Url, x: 120, y: 120 });
                }
              } else if (ctx.utils.isVideoUrl(str)) ctx.bus.emit({ t: 'ADD_VIDEO', url: str });
              else ctx.bus.emit({ t: 'ADD_IFRAME', url: str });
            } else {
              ctx.bus.emit({ t: 'ADD_TEXT', x: 120, y: 120, text: str });
            }
          });
        }
      }
    });
  }

  dispose(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
