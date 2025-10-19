import { InjectionToken } from '@angular/core';
import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import { EditorStore } from './services/editor-store.service';
import { CommandBusService } from './services/command-bus.service';
import { EditorUtilsService } from './services/editor-utils.service';
import { HistoryService } from './services/history.service';
import { EditorConfig } from './types';
import { OverlayService } from './services/overlay.service';
import { GuideLayer } from './guides';
import { HandleName, CursorType } from './enums';

/**
 * Базовые типы и классы для системы плагинов редактора.
 * 
 * Этот файл содержит:
 * - Интерфейсы для плагинов и контекста редактора
 * - Базовый класс NodeBase для всех редактируемых узлов
 * - Утилиты для генерации уникальных ID
 */

/**
 * Интерфейс плагина редактора.
 * 
 * Плагины расширяют функциональность редактора, добавляя обработку
 * специфичных команд и типов узлов (текст, изображения, фигуры и т.д.).
 */
export interface EditorPlugin {
  /** Уникальный идентификатор плагина */
  id: string;
  
  /**
   * Инициализация плагина.
   * Вызывается при запуске редактора для подписки на команды и события.
   * 
   * @param ctx - Контекст редактора с доступом ко всем сервисам
   */
  init(ctx: EditorContext): void;
  
  /**
   * Очистка ресурсов плагина (опционально).
   * Вызывается при уничтожении редактора.
   */
  dispose?(): void;
}

/**
 * Контекст редактора, передаваемый в плагины.
 * 
 * Содержит ссылки на все основные сервисы и объекты редактора,
 * необходимые для работы плагинов.
 */
export interface EditorContext {
  /** Экземпляр PixiJS Application */
  app: Application;
  
  /** Корневой контейнер сцены с привязкой к приложению */
  world: Container & { app: Application };
  
  /** Хранилище состояния редактора (ngrx ComponentStore) */
  store: EditorStore;
  
  /** Шина команд для обмена событиями между компонентами */
  bus: CommandBusService;
  
  /** Утилиты для работы с координатами, цветами и событиями */
  utils: EditorUtilsService;
  
  /** Сервис для управления DOM-оверлеями (textarea, iframe) */
  overlay: OverlayService;
  
  /** Слой направляющих линий для выравнивания */
  guides: GuideLayer;
  
  /** Конфигурация редактора */
  cfg: EditorConfig;
  
  /** Сервис управления историей изменений (Undo/Redo) */
  history: HistoryService;
}

/**
 * DI-токен для multi-провайдера плагинов редактора.
 * 
 * Используется для регистрации нескольких плагинов через Angular DI.
 * Каждый плагин регистрируется отдельным провайдером с multi: true.
 */
export const EDITOR_PLUGINS = new InjectionToken<EditorPlugin[]>('EDITOR_PLUGINS');

/**
 * Глобальный счетчик для генерации уникальных ID узлов.
 */
let idSequence = 1;

/**
 * Генерирует уникальный идентификатор для узла.
 * 
 * @param prefix - Префикс идентификатора (например, 'node', 'text', 'shape')
 * @returns Уникальная строка вида 'prefix_123'
 */
export function generateId(prefix: string): string { 
  return `${prefix}_${idSequence++}`; 
}

/**
 * Псевдоним для обратной совместимости.
 * @deprecated Используйте HandleName из enums.ts
 */
export type { HandleName };

/**
 * Расширение для Graphics с дополнительными полями.
 * 
 * PixiJS Graphics поддерживает произвольные поля. Мы используем их
 * для хранения типа курсора и метки хэндла.
 */
interface GraphicsWithMetadata {
  /** Тип курсора при наведении на хэндл */
  cursor?: CursorType;
  
  /** Название хэндла для идентификации */
  label?: HandleName;
}

/**
 * Базовый класс для всех редактируемых узлов на сцене редактора.
 * 
 * Отвечает за:
 * - Хранение общей геометрии (позиция, размер) и состояния выделения
 * - Отрисовку рамки выделения и интерактивных хэндлов изменения размера/поворота
 * - Предоставление абстрактного метода applyBoxSize для реакции на изменение размера
 * 
 * Все конкретные типы узлов (TextNode, ImageNode и т.д.) наследуются от этого класса.
 */
export abstract class NodeBase extends Container {
  /** Флаг выделения узла */
  selected = false;
  
  /** Уникальный идентификатор узла */
  id = generateId('node');
  
  /** Ширина узла в пикселях */
  w = 400;
  
  /** Высота узла в пикселях */
  h = 200;
  
  /** Внутренний отступ для содержимого (используется в TextNode) */
  padding = 12;
  
  /** Включена ли привязка к сетке для этого узла */
  snap = true;

  /** Graphics для отрисовки рамки выделения */
  frame = new Graphics();
  
  /** Контейнер для хэндлов изменения размера и поворота */
  handlesContainer = new Container();
  
  /** Словарь хэндлов по их названиям */
  handleRects: Partial<Record<HandleName, Graphics>> = {};

  /**
   * Конструктор базового узла.
   * Инициализирует рамку и контейнер хэндлов.
   */
  constructor() {
    super();
    this.addChild(this.frame, this.handlesContainer);
    this.eventMode = 'static';
    this.handlesContainer.visible = false;
  }

  /**
   * Устанавливает состояние выделения узла.
   * 
   * @param isSelected - true для выделения, false для снятия выделения
   */
  setSelected(isSelected: boolean): void {
    if (this.destroyed) return;
    
    this.selected = isSelected;
    
    // Показываем/скрываем хэндлы в зависимости от состояния выделения
    if (this.handlesContainer && !this.handlesContainer.destroyed) {
      this.handlesContainer.visible = isSelected;
    }
    
    this.drawFrame();
    
    // Убеждаемся, что хэндлы всегда поверх других элементов
    if (this.children?.length && this.handlesContainer && !this.handlesContainer.destroyed) {
      this.addChild(this.handlesContainer);
    }
  }

  /**
   * Применяет новый размер к узлу.
   * 
   * Абстрактный метод, который должен быть реализован в наследниках.
   * Реализация должна обновить внутренние визуальные элементы узла
   * в соответствии с новыми размерами.
   * 
   * @param width - Новая ширина в пикселях
   * @param height - Новая высота в пикселях
   */
  abstract applyBoxSize(width: number, height: number): void;

  /**
   * Отрисовывает рамку выделения вокруг узла.
   * 
   * Рамка меняет цвет в зависимости от состояния выделения.
   * Также расширяет область клика (hitArea) для учета места под хэндлы.
   */
  drawFrame(): void {
    if (this.destroyed) return;
    
    const graphics = this.frame;
    if (!graphics || graphics.destroyed || typeof graphics.clear !== 'function') return;
    
    graphics.clear();
    
    // Цвет рамки зависит от состояния выделения
    const strokeColor = this.selected ? 0x99ffaa : 0x6b7280;
    const strokeAlpha = this.selected ? 0.9 : 0.5;
    
    graphics.roundRect(0, 0, this.w, this.h, 8)
      .stroke({ color: strokeColor, width: 1, alpha: strokeAlpha });
    
    // Расширяем область клика для учета хэндлов
    const marginTop = 40;      // Место для хэндла поворота
    const marginSide = 14;     // Место для боковых хэндлов
    const marginBottom = 14;   // Место для нижних хэндлов
    
    this.hitArea = new Rectangle(
      -marginSide, 
      -marginTop, 
      this.w + marginSide * 2, 
      this.h + marginTop + marginBottom
    );
  }

  /**
   * Отрисовывает или обновляет хэндлы изменения размера и поворота.
   * 
   * Создает 8 хэндлов изменения размера (по углам и сторонам) и
   * 1 хэндл поворота (над верхней серединой).
   * 
   * @param initialize - true для пересоздания Graphics объектов, 
   *                     false для обновления только позиций
   */
  drawHandles(initialize = false): void {
    // Все названия хэндлов
    const handleNames: readonly HandleName[] = [
      'nw', 'n', 'ne',   // Верхний ряд
      'e',                // Правая сторона
      'se', 's', 'sw',   // Нижний ряд
      'w',                // Левая сторона
      'rot'               // Хэндл поворота
    ];
    
    // Позиции хэндлов относительно узла
    const handlePositions: Record<HandleName, [number, number]> = {
      nw: [0, 0],                    // Верхний левый угол
      n: [this.w / 2, 0],           // Верхняя середина
      ne: [this.w, 0],              // Верхний правый угол
      e: [this.w, this.h / 2],      // Правая середина
      se: [this.w, this.h],         // Нижний правый угол
      s: [this.w / 2, this.h],      // Нижняя середина
      sw: [0, this.h],              // Нижний левый угол
      w: [0, this.h / 2],           // Левая середина
      rot: [this.w / 2, -28],       // Хэндл поворота (над узлом)
    };

    // При инициализации пересоздаем все хэндлы
    if (initialize) {
      this.handlesContainer.removeChildren();
      this.handleRects = {};
    }

    // Создаем или обновляем каждый хэндл
    for (const handleName of handleNames) {
      let handleGraphics = this.handleRects[handleName];
      
      // Создаем новый хэндл, если его еще нет
      if (!handleGraphics) {
        handleGraphics = new Graphics();
        this.handleRects[handleName] = handleGraphics;
        this.handlesContainer.addChild(handleGraphics);
        handleGraphics.eventMode = 'static';
        
        // Область клика зависит от типа хэндла
        handleGraphics.hitArea = handleName === 'rot' 
          ? new Rectangle(-12, -12, 24, 24)  // Больше для хэндла поворота
          : new Rectangle(-10, -10, 20, 20); // Стандартный размер
      }
      
      handleGraphics.clear();
      
      // Добавляем метаданные к Graphics
      const graphicsWithMeta = handleGraphics as unknown as GraphicsWithMetadata;
      
      // Отрисовка зависит от типа хэндла
      if (handleName === 'rot') {
        // Хэндл поворота: линия + круг
        handleGraphics.moveTo(0, 6).lineTo(0, 16)
          .stroke({ color: 0xeeff99, width: 1 });
        handleGraphics.circle(0, 0, 6)
          .fill(0xffffff)
          .stroke({ color: 0x99ffaa, width: 1 });
        graphicsWithMeta.cursor = 'grab';
      } else {
        // Хэндлы изменения размера: квадраты
        handleGraphics.roundRect(-5, -5, 10, 10, 2)
          .fill(0xffffff)
          .stroke({ color: 0xeeff99, width: 1 });
        
        // Курсор зависит от направления изменения размера
        graphicsWithMeta.cursor =
          handleName === 'n' || handleName === 's' ? 'ns-resize' :
          handleName === 'e' || handleName === 'w' ? 'ew-resize' :
          handleName === 'ne' || handleName === 'sw' ? 'nesw-resize' :
          'nwse-resize';
      }
      
      // Устанавливаем позицию хэндла
      const [positionX, positionY] = handlePositions[handleName];
      handleGraphics.position.set(positionX, positionY);
      
      // Сохраняем метку для идентификации
      graphicsWithMeta.label = handleName;
    }
  }
}
