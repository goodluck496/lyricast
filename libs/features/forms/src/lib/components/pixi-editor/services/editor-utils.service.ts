import { Injectable } from '@angular/core';
import { fromEventPattern } from 'rxjs';
import { Container, Point } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

@Injectable({ providedIn: 'root' })
export class EditorUtilsService {
  /** Minimal Pixi-like emitter interface to RxJS observable */
  fromPixi<T = unknown>(
    emitter: { on: (event: string, fn: (payload: unknown) => void) => void; off: (event: string, fn: (payload: unknown) => void) => void },
    event: string,
  ) {
    return fromEventPattern<T>(
      (handler: (payload: T) => void) => emitter.on(event, handler as unknown as (payload: unknown) => void),
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
  isImageUrl(url: string) { return /(\.(png|jpe?g|gif|webp|avif|svg))(\?|#|$)/i.test(url); }
  isVideoUrl(url: string) { return /(\.(mp4|webm|ogg))(\?|#|$)/i.test(url); }

  base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}
