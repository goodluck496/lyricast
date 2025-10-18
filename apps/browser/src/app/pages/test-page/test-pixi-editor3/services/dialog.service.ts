import { Injectable } from '@angular/core';
import { fromEvent, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class DialogService {
  /** Lightweight modal text input. Returns trimmed value or null on cancel. */
  askUrl(title: string): Promise<string | null> {
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

      const h = document.createElement('div');
      h.textContent = title;
      h.style.marginBottom = '8px';
      h.style.fontWeight = '600';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'https://...';
      Object.assign(input.style, {
        width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #475569',
        outline: 'none', background: '#111827', color: '#e5e7eb'
      } as CSSStyleDeclaration);

      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px'
      } as CSSStyleDeclaration);

      const ok = document.createElement('button');
      ok.textContent = 'OK';
      Object.assign(ok.style, { padding: '6px 12px', borderRadius: '8px', border: '1px solid #94a3b8', cursor: 'pointer' } as CSSStyleDeclaration);
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      Object.assign(cancel.style, { padding: '6px 12px', borderRadius: '8px', border: '1px solid #94a3b8', cursor: 'pointer' } as CSSStyleDeclaration);

      const closed$ = new Subject<void>();
      const close = (val: string | null) => {
        closed$.next();
        closed$.complete();
        overlay.remove();
        resolve(val?.trim() ? val.trim() : null);
      };
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); if (e.key === 'Enter') close(input.value); };
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
}
