import { InjectionToken } from '@angular/core';
import { Application, Container } from 'pixi.js';
import { EditorStore } from './services/editor-store.service';
import { CommandBusService } from './services/command-bus.service';
import { EditorUtilsService } from './services/editor-utils.service';
import { HistoryService } from './services/history.service';
import { NodeFactoryService } from './services/node-factory.service'; // <-- Добавлен импорт
import { EditorConfig } from './types';
import { OverlayService } from './services/overlay.service';
import { GuideLayer } from './guides';

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

  /** Фабрика для создания узлов */
  nodeFactory: NodeFactoryService; // <-- Новое поле

  /** Функция для получения текущих границ сцены */
  getSceneBounds: () => { x: number; y: number; width: number; height: number };
}

/**
 * DI-токен для multi-провайдера плагинов редактора.
 *
 * Используется для регистрации нескольких плагинов через Angular DI.
 * Каждый плагин регистрируется отдельным провайдером с multi: true.
 */
export const EDITOR_PLUGINS = new InjectionToken<EditorPlugin[]>(
  'EDITOR_PLUGINS'
);
