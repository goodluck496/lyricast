import { inject, Injectable } from '@angular/core';
import { Application, Container, Graphics, Texture } from 'pixi.js';
import { EditorStore } from './editor-store.service';
import { EDITOR_CONFIG } from '../types';

@Injectable()
export class SceneViewportService {
  private readonly store = inject(EditorStore);
  private readonly cfg = inject(EDITOR_CONFIG);

  public app!: Application;
  public world!: Container;
  public aspectRatio!: '16:9' | '4:3' | 'none';

  private sceneBounds?: Container;
  public sceneWidth = 1920;
  public sceneHeight = 1080;
  public baseSceneWidth = 1920;
  public baseSceneHeight = 1080;

  private canonicalCanvasWidth: number | null = null;

  public resetCanonicalDimensions(): void {
    this.canonicalCanvasWidth = null;
  }

  getSceneBounds(): { x: number; y: number; width: number; height: number } {
    // Возвращаем фактическое положение и размер сцены в координатах stage
    return {
      x: this.world.x,
      y: this.world.y,
      width: this.sceneWidth,
      height: this.sceneHeight,
    };
  }

  updateSceneBounds() {
    if (this.sceneBounds) {
      this.world.removeChild(this.sceneBounds);
      this.sceneBounds.destroy();
    }

    const liveCanvasWidth = this.app.renderer.width;
    if (this.canonicalCanvasWidth === null && liveCanvasWidth > 0) {
      this.canonicalCanvasWidth = liveCanvasWidth;
    }
    const canvasWidth = this.canonicalCanvasWidth || liveCanvasWidth;

    const canvasHeight = this.app.renderer.height;
    const zoom = this.store.snapshot((s) => s.zoom);

    if (this.aspectRatio === 'none') {
      this.sceneWidth = canvasWidth / zoom;
      this.sceneHeight = canvasHeight / zoom;
      this.baseSceneWidth = canvasWidth;
      this.baseSceneHeight = canvasHeight;
    } else {
      const ratio = this.aspectRatio === '16:9' ? 16 / 9 : 4 / 3;
      if (canvasWidth / canvasHeight > ratio) {
        this.sceneHeight = (canvasHeight * 0.9) / zoom;
        this.sceneWidth = this.sceneHeight * ratio;
        this.baseSceneHeight = canvasHeight * 0.9;
        this.baseSceneWidth = this.baseSceneHeight * ratio;
      } else {
        this.sceneWidth = (canvasWidth * 0.9) / zoom;
        this.sceneHeight = this.sceneWidth / ratio;
        this.baseSceneWidth = canvasWidth * 0.9;
        this.baseSceneHeight = this.baseSceneWidth / ratio;
      }
    }

    // Сдвигаем сам контейнер world для центрирования
    this.world.x = (canvasWidth / zoom - this.sceneWidth) / 2;
    this.world.y = (canvasHeight / zoom - this.sceneHeight) / 2;

    // Рисуем рамку в локальных координатах (0,0) контейнера world
    const g = new Graphics();
    g.setStrokeStyle({ width: 2 / zoom, color: 0xff6b6b, alpha: 0.8 });

    const dashLength = 10 / zoom;
    const gapLength = 5 / zoom;

    for (let i = 0; i < this.sceneWidth; i += dashLength + gapLength) {
      const len = Math.min(dashLength, this.sceneWidth - i);
      g.moveTo(i, 0).lineTo(i + len, 0);
    }
    for (let i = 0; i < this.sceneHeight; i += dashLength + gapLength) {
      const len = Math.min(dashLength, this.sceneHeight - i);
      g.moveTo(this.sceneWidth, i).lineTo(this.sceneWidth, i + len);
    }
    for (let i = 0; i < this.sceneWidth; i += dashLength + gapLength) {
      const len = Math.min(dashLength, this.sceneWidth - i);
      g.moveTo(this.sceneWidth - i, this.sceneHeight).lineTo(this.sceneWidth - i - len, this.sceneHeight);
    }
    for (let i = 0; i < this.sceneHeight; i += dashLength + gapLength) {
      const len = Math.min(dashLength, this.sceneHeight - i);
      g.moveTo(0, this.sceneHeight - i).lineTo(0, this.sceneHeight - i - len);
    }

    g.stroke();
    this.sceneBounds = g;
    this.world.addChild(this.sceneBounds);
  }

  createGridTexture(size = 20, line = 1, alpha = 0.08) {
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
}
