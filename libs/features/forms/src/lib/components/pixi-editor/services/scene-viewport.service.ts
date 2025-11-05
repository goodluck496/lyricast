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

  getSceneBounds(): { x: number; y: number; width: number; height: number } {
    const canvasWidth = this.app.renderer.width;
    const canvasHeight = this.app.renderer.height;
    const zoom = this.store.snapshot((s) => s.zoom);

    // These are the dimensions of the scene in world coordinates (without zoom applied)
    const sceneWidth = this.sceneWidth;
    const sceneHeight = this.sceneHeight;

    // Calculate the offset of the scene within the world container
    const sceneOffsetX = (canvasWidth / zoom - sceneWidth) / 2;
    const sceneOffsetY = (canvasHeight / zoom - sceneHeight) / 2;

    return {
      x: sceneOffsetX,
      y: sceneOffsetY,
      width: sceneWidth,
      height: sceneHeight,
    };
  }

  updateSceneBounds() {
    // Удаляем старые границы если есть
    if (this.sceneBounds) {
      this.world.removeChild(this.sceneBounds);
      this.sceneBounds.destroy();
      this.sceneBounds = undefined;
    }

    // Определяем размеры сцены на основе соотношения сторон
    const canvasWidth = this.app.renderer.width;
    const canvasHeight = this.app.renderer.height;

    // Учитываем текущий zoom и позицию world
    const zoom = this.store.snapshot((s) => s.zoom);

    console.log(`[UPDATE SCENE BOUNDS] Initial - canvasW: ${canvasWidth}, canvasH: ${canvasHeight}, zoom: ${zoom}, aspectRatio: ${this.aspectRatio}`);

    if (this.aspectRatio === 'none') {
      // Для 'none' используем размеры canvas
      this.sceneWidth = canvasWidth / zoom;
      this.sceneHeight = canvasHeight / zoom;
      // Базовые размеры без zoom (при zoom=1)
      this.baseSceneWidth = canvasWidth;
      this.baseSceneHeight = canvasHeight;
      // No return here, continue to drawing
    } else if (this.aspectRatio === '16:9') {
      // Вычисляем размеры для 16:9
      const ratio = 16 / 9;
      if (canvasWidth / canvasHeight > ratio) {
        // Ограничены по высоте
        this.sceneHeight = (canvasHeight * 0.9) / zoom; // 90% высоты canvas с учетом zoom
        this.sceneWidth = this.sceneHeight * ratio;
        // Базовые размеры при zoom=1
        this.baseSceneHeight = canvasHeight * 0.9;
        this.baseSceneWidth = this.baseSceneHeight * ratio;
      } else {
        // Ограничены по ширине
        this.sceneWidth = (canvasWidth * 0.9) / zoom; // 90% ширины canvas с учетом zoom
        this.sceneHeight = this.sceneWidth / ratio;
        // Базовые размеры при zoom=1
        this.baseSceneWidth = canvasWidth * 0.9;
        this.baseSceneHeight = this.baseSceneWidth / ratio;
      }
    } else {
    //   // 4:3
    //   const ratio = 4 / 3;
    //   if (canvasWidth / canvasHeight > ratio) {
    //     this.sceneHeight = canvasHeight / zoom;
    //     this.sceneWidth = this.sceneHeight * ratio;
    //     // Базовые размеры при zoom=1
    //     this.baseSceneHeight = canvasHeight;
    //     this.baseSceneWidth = this.baseSceneHeight * ratio;
    //   }
    // } else {
      // 4:3
      const ratio = 4 / 3;
      if (canvasWidth / canvasHeight > ratio) {
        this.sceneHeight = (canvasHeight * 0.9) / zoom;
        this.sceneWidth = this.sceneHeight * ratio;
        // Базовые размеры при zoom=1
        this.baseSceneHeight = canvasHeight * 0.9;
        this.baseSceneWidth = this.baseSceneHeight * ratio;
      } else {
        this.sceneWidth = (canvasWidth * 0.9) / zoom;
        this.sceneHeight = this.sceneWidth / ratio;
        // Базовые размеры при zoom=1
        this.baseSceneWidth = canvasWidth * 0.9;
        this.baseSceneHeight = this.baseSceneWidth / ratio;
      }
    }

    console.log(`[UPDATE SCENE BOUNDS] Calculated - sceneW: ${this.sceneWidth}, sceneH: ${this.sceneHeight}`);

    // Создаём контейнер для границ
    const bounds = new Container();
    const g = new Graphics();

    const sceneWidth = this.sceneWidth;
    const sceneHeight = this.sceneHeight;

    // Центрируем сцену относительно видимой области world
    const x = (canvasWidth / zoom - sceneWidth) / 2;
    const y = (canvasHeight / zoom - sceneHeight) / 2;

    console.log(`[UPDATE SCENE BOUNDS] Final offset - x: ${x}, y: ${y}`);

    // Рисуем границы (пунктирная линия)
    g.setStrokeStyle({ width: 2 / zoom, color: 0xff6b6b, alpha: 0.8 });

    // Рисуем прямоугольник границ
    const dashLength = 10 / zoom;
    const gapLength = 5 / zoom;

    // Верхняя линия
    for (let i = 0; i < sceneWidth; i += dashLength + gapLength) {
      const len = Math.min(dashLength, sceneWidth - i);
      g.moveTo(x + i, y);
      g.lineTo(x + i + len, y);
    }

    // Правая линия
    for (let i = 0; i < sceneHeight; i += dashLength + gapLength) {
      const len = Math.min(dashLength, sceneHeight - i);
      g.moveTo(x + sceneWidth, y + i);
      g.lineTo(x + sceneWidth, y + i + len);
    }

    // Нижняя линия
    for (let i = 0; i < sceneWidth; i += dashLength + gapLength) {
      const len = Math.min(dashLength, sceneWidth - i);
      g.moveTo(x + sceneWidth - i, y + sceneHeight);
      g.lineTo(x + sceneWidth - i - len, y + sceneHeight);
    }

    // Левая линия
    for (let i = 0; i < sceneHeight; i += dashLength + gapLength) {
      const len = Math.min(dashLength, sceneHeight - i);
      g.moveTo(x, y + sceneHeight - i);
      g.lineTo(x, y + sceneHeight - i - len);
    }

    g.stroke();

    bounds.addChild(g);

    this.sceneBounds = bounds;
    // Добавляем границы поверх всего, но под handles
    this.world.addChild(bounds);

    console.log(`[UPDATE SCENE BOUNDS] Red frame container position (relative to world): bounds.x: ${bounds.x}, bounds.y: ${bounds.y}`);
    console.log(`[UPDATE SCENE BOUNDS] Red frame drawing offset (relative to bounds): drawX: ${x}, drawY: ${y}`);
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
