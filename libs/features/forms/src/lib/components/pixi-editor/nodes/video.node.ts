import { DestroyOptions, Sprite, Texture } from 'pixi.js';
import { loadTextureRobust } from '../utils/texture-loader';
import { NodeBase } from './base.node';

export class VideoNode extends NodeBase {
  public sprite: Sprite;
  public assetId?: string; // For locally stored assets
  public url = ''; // For external URLs

  get videoUrl(): string {
    // For serialization, we prioritize assetId, otherwise use url
    return this.assetId || this.url;
  }

  constructor(initialSource?: string) {
    super();
    this.sprite = new Sprite(Texture.WHITE);
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite);
    this.addChild(this.handlesContainer);
    this.drawHandles(true);

    if (initialSource) {
      // Determine if initialSource is an assetId or a URL
      if (
        initialSource.startsWith('http:') ||
        initialSource.startsWith('https:') ||
        initialSource.startsWith('data:')
      ) {
        this.url = initialSource;
      } else {
        this.assetId = initialSource;
      }
      void this.setVideo(initialSource);
    }
  }

  async setVideo(source: string) {
    try {
      const texture = await loadTextureRobust(source);
      this.sprite.texture = texture;
      this.sprite.width = texture.width;
      this.sprite.height = texture.height;
      this.applyBoxSize(texture.width, texture.height);
    } catch (e) {
      console.error('Failed to load video:', source, e);
      // Fallback to a placeholder or clear the video
      this.sprite.texture = Texture.WHITE;
      this.sprite.width = 100;
      this.sprite.height = 100;
      this.applyBoxSize(100, 100);
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

  override destroy(options?: DestroyOptions | boolean): void {
    this.sprite.destroy(options);
    super.destroy(options);
  }
}
