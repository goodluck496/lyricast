import { NodeBase } from './base.node';
import { DestroyOptions, Sprite, Texture } from 'pixi.js';
import { loadTextureRobust } from '../utils/texture-loader';

export class ImageNode extends NodeBase {
  public sprite: Sprite;
  public assetId?: string; // For locally stored assets
  public url?: string; // For external URLs

  get imageUrl(): string | undefined {
    // For serialization, we prioritize assetId, otherwise use url
    return this.assetId || this.url;
  }

  constructor(initialSource?: string, isCastingMode = false, scale: number = 1) {
    super(isCastingMode);
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
      void this.setImage(initialSource);
    }
  }

  async setImage(source: string): Promise<void> {
    try {
      const texture = await loadTextureRobust(source);
      this.sprite.texture = texture;
      this.sprite.width = texture.width;
      this.sprite.height = texture.height;
      // УДАЛЯЕМ ЭТУ СТРОКУ: this.applyBoxSize(texture.width, texture.height);
    } catch (e) {
      console.error('Failed to load image:', source, e);
      // Fallback to a placeholder or clear the image
      this.sprite.texture = Texture.WHITE;
      this.sprite.width = 100;
      this.sprite.height = 100;
      // УДАЛЯЕМ ЭТУ СТРОКУ: this.applyBoxSize(100, 100);
    }
  }

  override destroy(options?: DestroyOptions | boolean): void {
    this.sprite.destroy(options);
    super.destroy(options);
  }

  applyBoxSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawFrame();
    this.drawHandles();
    if (this.sprite.texture && this.sprite.texture.width > 0 && this.sprite.texture.height > 0) {
      const { width, height } = this.sprite.texture;
      const scale = Math.min(this.w / width, this.h / height);
      this.sprite.position.set(this.w / 2, this.h / 2);
      this.sprite.scale.set(scale);
    } else {
      // Если текстура еще не загружена или имеет нулевые размеры, используем дефолтные
      this.sprite.position.set(this.w / 2, this.h / 2);
      this.sprite.scale.set(1); // Или другой дефолтный масштаб
    }
  }
}
