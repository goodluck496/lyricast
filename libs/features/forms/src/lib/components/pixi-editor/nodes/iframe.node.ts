import { NodeBase } from './base.node';

/** IframeNode is rendered via DOM overlay (not inside Pixi). */
export class IframeNode extends NodeBase {
  readonly type = 'iframe' as const;
  url = 'about:blank';

  constructor(url?: string, isCastingMode: boolean = false) {
    super(isCastingMode);
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
