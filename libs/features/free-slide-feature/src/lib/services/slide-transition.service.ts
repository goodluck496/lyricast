import { Injectable } from '@angular/core';
import { Container, Application } from 'pixi.js';
import { SlideTransition, TransitionType, TransitionEasing } from '@lyri-cast/entities';

export interface TransitionContext {
  app: Application;
  oldScene: Container;
  newScene: Container;
  transition: SlideTransition;
}

@Injectable({
  providedIn: 'root',
})
export class SlideTransitionService {
  /**
   * Выполняет переход между слайдами
   */
  async executeTransition(context: TransitionContext): Promise<void> {
    const { app, oldScene, newScene, transition } = context;

    if (transition.type === 'none' || transition.duration <= 0) {
      // Без перехода - просто заменяем сцену
      app.stage.removeChildren();
      app.stage.addChild(newScene);
      return;
    }

    // Добавляем задержку если нужно
    if (transition.delay && transition.delay > 0) {
      await this.delay(transition.delay);
    }

    // Выполняем конкретный переход
    switch (transition.type) {
      case 'fade':
        await this.fadeTransition(context);
        break;
      case 'slideLeft':
        await this.slideTransition(context, 'left');
        break;
      case 'slideRight':
        await this.slideTransition(context, 'right');
        break;
      case 'slideUp':
        await this.slideTransition(context, 'up');
        break;
      case 'slideDown':
        await this.slideTransition(context, 'down');
        break;
      case 'zoomIn':
        await this.zoomTransition(context, 'in');
        break;
      case 'zoomOut':
        await this.zoomTransition(context, 'out');
        break;
      case 'flipHorizontal':
        await this.flipTransition(context, 'horizontal');
        break;
      case 'flipVertical':
        await this.flipTransition(context, 'vertical');
        break;
      case 'rotateIn':
        await this.rotateTransition(context, 'in');
        break;
      case 'rotateOut':
        await this.rotateTransition(context, 'out');
        break;
      case 'dissolve':
        await this.dissolveTransition(context);
        break;
      case 'wipeLeft':
        await this.wipeTransition(context, 'left');
        break;
      case 'wipeRight':
        await this.wipeTransition(context, 'right');
        break;
      case 'wipeUp':
        await this.wipeTransition(context, 'up');
        break;
      case 'wipeDown':
        await this.wipeTransition(context, 'down');
        break;
      default:
        // Если неизвестный тип перехода, просто заменяем сцену
        app.stage.removeChildren();
        app.stage.addChild(newScene);
    }
  }

  private async fadeTransition(context: TransitionContext): Promise<void> {
    const { app, oldScene, newScene, transition } = context;
    
    // Кроссфейд: новая сцена проявляется, старая затухает одновременно
    newScene.alpha = 0;
    oldScene.alpha = 1;
    app.stage.removeChildren();
    app.stage.addChild(oldScene);
    app.stage.addChild(newScene);

    await Promise.all([
      this.animateProperty(
        newScene,
        'alpha',
        0,
        1,
        transition.duration,
        transition.easing
      ),
      this.animateProperty(
        oldScene,
        'alpha',
        1,
        0,
        transition.duration,
        transition.easing
      ),
    ]);

    app.stage.removeChild(oldScene);
    newScene.alpha = 1;
  }

  private async slideTransition(
    context: TransitionContext,
    direction: 'left' | 'right' | 'up' | 'down'
  ): Promise<void> {
    const { app, oldScene, newScene, transition } = context;
    
    const screenWidth = app.screen.width;
    const screenHeight = app.screen.height;

    // Устанавливаем начальные позиции
    switch (direction) {
      case 'left':
        newScene.x = screenWidth;
        break;
      case 'right':
        newScene.x = -screenWidth;
        break;
      case 'up':
        newScene.y = screenHeight;
        break;
      case 'down':
        newScene.y = -screenHeight;
        break;
    }

    app.stage.removeChildren();
    app.stage.addChild(oldScene);
    app.stage.addChild(newScene);

    // Анимация сдвига: корректные цели по соответствующим осям
    const moveOnX = direction === 'left' || direction === 'right';
    const newFrom = moveOnX ? newScene.x : newScene.y;
    const newTo = 0;
    const oldFrom = moveOnX ? oldScene.x : oldScene.y;
    const oldTo = moveOnX
      ? (direction === 'left' ? -screenWidth : direction === 'right' ? screenWidth : 0)
      : (direction === 'up' ? -screenHeight : direction === 'down' ? screenHeight : 0);

    await Promise.all([
      this.animateProperty(
        newScene,
        moveOnX ? 'x' : 'y',
        newFrom,
        newTo,
        transition.duration,
        transition.easing
      ),
      this.animateProperty(
        oldScene,
        moveOnX ? 'x' : 'y',
        oldFrom,
        oldTo,
        transition.duration,
        transition.easing
      ),
    ]);

    // Удаляем старую сцену
    app.stage.removeChild(oldScene);
  }

  private async zoomTransition(
    context: TransitionContext,
    direction: 'in' | 'out'
  ): Promise<void> {
    const { app, oldScene, newScene, transition } = context;
    
    // Устанавливаем начальные состояния
    if (direction === 'in') {
      newScene.scale.set(0, 0);
      oldScene.alpha = 1;
    } else {
      newScene.alpha = 1;
      oldScene.scale.set(1, 1);
    }

    app.stage.removeChildren();
    app.stage.addChild(oldScene);
    app.stage.addChild(newScene);

    // Анимация
    if (direction === 'in') {
      await Promise.all([
        this.animateProperty(
          newScene.scale,
          'x',
          0,
          1,
          transition.duration,
          transition.easing
        ),
        this.animateProperty(
          newScene.scale,
          'y',
          0,
          1,
          transition.duration,
          transition.easing
        ),
      ]);
      oldScene.alpha = 0;
    } else {
      await Promise.all([
        this.animateProperty(
          oldScene.scale,
          'x',
          1,
          0,
          transition.duration,
          transition.easing
        ),
        this.animateProperty(
          oldScene.scale,
          'y',
          1,
          0,
          transition.duration,
          transition.easing
        ),
      ]);
    }

    // Удаляем старую сцену
    app.stage.removeChild(oldScene);
  }

  private async flipTransition(
    context: TransitionContext,
    direction: 'horizontal' | 'vertical'
  ): Promise<void> {
    const { app, oldScene, newScene, transition } = context;
    
    // Устанавливаем начальные состояния
    newScene.scale.set(direction === 'horizontal' ? 0 : 1, direction === 'vertical' ? 0 : 1);
    
    app.stage.removeChildren();
    app.stage.addChild(oldScene);
    app.stage.addChild(newScene);

    // Анимация
    const scaleProperty = direction === 'horizontal' ? 'x' : 'y';
    
    await Promise.all([
      this.animateProperty(
        oldScene.scale,
        scaleProperty,
        1,
        0,
        transition.duration / 2,
        transition.easing
      ),
    ]);

    oldScene.scale.set(direction === 'horizontal' ? 1 : oldScene.scale.x, direction === 'vertical' ? 1 : oldScene.scale.y);
    
    await this.animateProperty(
      newScene.scale,
      scaleProperty,
      0,
      1,
      transition.duration / 2,
      transition.easing
    );

    // Удаляем старую сцену
    app.stage.removeChild(oldScene);
  }

  private async rotateTransition(
    context: TransitionContext,
    direction: 'in' | 'out'
  ): Promise<void> {
    const { app, oldScene, newScene, transition } = context;
    
    // Устанавливаем начальные состояния
    newScene.rotation = direction === 'in' ? Math.PI * 2 : 0;
    newScene.alpha = direction === 'in' ? 0 : 1;
    oldScene.alpha = 1;

    app.stage.removeChildren();
    app.stage.addChild(oldScene);
    app.stage.addChild(newScene);

    // Анимация
    if (direction === 'in') {
      await Promise.all([
        this.animateProperty(
          newScene,
          'rotation',
          Math.PI * 2,
          0,
          transition.duration,
          transition.easing
        ),
        this.animateProperty(
          newScene,
          'alpha',
          0,
          1,
          transition.duration,
          transition.easing
        ),
      ]);
      oldScene.alpha = 0;
    } else {
      await Promise.all([
        this.animateProperty(
          oldScene,
          'rotation',
          0,
          Math.PI * 2,
          transition.duration,
          transition.easing
        ),
        this.animateProperty(
          oldScene,
          'alpha',
          1,
          0,
          transition.duration,
          transition.easing
        ),
      ]);
    }

    // Удаляем старую сцену
    app.stage.removeChild(oldScene);
  }

  private async dissolveTransition(context: TransitionContext): Promise<void> {
    const { app, oldScene, newScene, transition } = context;
    
    // Простая реализация растворения через затухание
    await this.fadeTransition(context);
  }

  private async wipeTransition(
    context: TransitionContext,
    direction: 'left' | 'right' | 'up' | 'down'
  ): Promise<void> {
    const { app, oldScene, newScene, transition } = context;
    
    const screenWidth = app.screen.width;
    const screenHeight = app.screen.height;

    // Создаем маску для эффекта вытеснения
    const mask = new Container();
    
    // Устанавливаем начальные позиции
    switch (direction) {
      case 'left':
        newScene.x = screenWidth;
        break;
      case 'right':
        newScene.x = -screenWidth;
        break;
      case 'up':
        newScene.y = screenHeight;
        break;
      case 'down':
        newScene.y = -screenHeight;
        break;
    }

    app.stage.removeChildren();
    app.stage.addChild(oldScene);
    app.stage.addChild(newScene);

    // Анимация вытеснения: перемещаем новую сцену к 0 по нужной оси
    const moveOnX = direction === 'left' || direction === 'right';
    const from = moveOnX ? newScene.x : newScene.y;
    const to = 0;

    await this.animateProperty(
      newScene,
      moveOnX ? 'x' : 'y',
      from,
      to,
      transition.duration,
      transition.easing
    );

    // Удаляем старую сцену
    app.stage.removeChild(oldScene);
  }

  /**
   * Анимирует свойство объекта с использованием easing функции
   */
  private async animateProperty(
    object: any,
    property: string,
    from: number,
    to: number,
    duration: number,
    easing: TransitionEasing
  ): Promise<void> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      const animate = () => {
        const currentTime = performance.now();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easedProgress = this.applyEasing(progress, easing);
        const currentValue = from + (to - from) * easedProgress;
        
        object[property] = currentValue;
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve(void 0);
        }
      };
      
      requestAnimationFrame(animate);
    });
  }

  /**
   * Применяет easing функцию
   */
  private applyEasing(t: number, easing: TransitionEasing): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'easeIn':
        return t * t;
      case 'easeOut':
        return t * (2 - t);
      case 'easeInOut':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'easeInQuad':
        return t * t;
      case 'easeOutQuad':
        return t * (2 - t);
      case 'easeInOutQuad':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'easeInCubic':
        return t * t * t;
      case 'easeOutCubic':
        return (--t) * t * t + 1;
      case 'easeInOutCubic':
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
      case 'easeInQuart':
        return t * t * t * t;
      case 'easeOutQuart':
        return 1 - (--t) * t * t * t;
      case 'easeInOutQuart':
        return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t;
      default:
        return t;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
