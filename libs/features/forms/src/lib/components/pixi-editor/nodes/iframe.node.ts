import { NodeBase } from './base.node';
import { Graphics, Sprite } from 'pixi.js';
import { loadTextureRobust } from '../utils/texture-loader';

/** IframeNode is rendered via DOM overlay (not inside Pixi). */
export class IframeNode extends NodeBase {
  readonly type = 'iframe' as const;
  url = 'about:blank';
  private bgG = new Graphics();
  private placeholderSprite = new Sprite();

  constructor(url?: string, isCastingMode: boolean = false) {
    super(isCastingMode);
    if (url) this.url = url;
    
    this.placeholderSprite.anchor.set(0.5);
    this.addChild(this.bgG);
    this.addChild(this.placeholderSprite);
    this.addChild(this.handlesContainer);
    
    this.drawFrame();
    this.drawHandles(true);
    
    if (this.url.includes('youtube') || this.url.includes('youtu.be')) {
      this.loadYoutubeThumbnail();
    }
  }

  private async loadYoutubeThumbnail() {
    const match = this.url.match(/embed\/([^?]+)/);
    if (match && match[1]) {
      const videoId = match[1];
      try {
        const tex = await loadTextureRobust(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
        this.placeholderSprite.texture = tex;
        this.applyBoxSize(this.w, this.h);
      } catch (e) {
        // ignore thumbnail failure
      }
    }
  }

  applyBoxSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    
    this.bgG.clear().roundRect(0, 0, w, h, 6).fill(0x333333);
    
    if (this.placeholderSprite.texture && this.placeholderSprite.texture.width > 0) {
       this.placeholderSprite.width = w;
       this.placeholderSprite.height = h;
       this.placeholderSprite.position.set(w / 2, h / 2);
    }
    
    this.drawFrame();
    this.drawHandles();
  }
}
