import { Inject, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { EDITOR_CONFIG, EditorConfig, UiTextStyles } from '../types';
import { NodeType } from '../enums';
import type { NodeBase } from '../core';

/**
 * Сервис управления состоянием редактора.
 *
 * Использует ngrx ComponentStore для управления состоянием редактора.
 * Хранит информацию о всех узлах, выделении, масштабе и UI-настройках.
 */

/**
 * Состояние одного узла в редакторе.
 *
 * Содержит метаданные узла и ссылку на фактический PixiJS-объект.
 */
export interface NodeState {
  /** Уникальный идентификатор узла */
  id: string;

  /** Тип узла */
  type: NodeType;

  /** Ссылка на фактический PixiJS-объект (NodeBase) */
  ref: NodeBase;
}

/**
 * Модель представления состояния редактора.
 *
 * Содержит всю информацию о текущем состоянии редактора,
 * включая узлы, выделение, настройки вида и UI-параметры.
 */
export interface EditorViewModel {
  /** Словарь всех узлов по их ID */
  nodes: Record<string, NodeState>;

  /** Порядок узлов (z-индекс) */
  order: string[];

  /** Массив ID выделенных узлов */
  selectedIds: string[];

  /** Текущий масштаб (1.0 = 100%) */
  zoom: number;

  /** Включена ли привязка к сетке */
  snapEnabled: boolean;

  /** Включены ли направляющие линии */
  guidesEnabled: boolean;

  /** Текущие настройки UI (шрифт, цвет, выравнивание и т.д.) */
  ui: UiTextStyles;

  /** URL аудио-дорожки (опционально) */
  audioUrl?: string;

  /** Воспроизводится ли аудио в данный момент */
  isPlayingAudio: boolean;

  /** Активен ли режим рисования кистью */
  brushActive?: boolean;
}

@Injectable()
export class EditorStore extends ComponentStore<EditorViewModel> {
  constructor(@Inject(EDITOR_CONFIG) cfg: EditorConfig) {
    super({
      nodes: {},
      order: [],
      selectedIds: [],
      zoom: 1,
      snapEnabled: true,
      guidesEnabled: true,
      ui: {
        font: cfg.defaults.family,
        weight: cfg.defaults.weight,
        colorHex: '#ffffff',
        color: 0xffffff,
        align: cfg.defaults.align,
        lineHeight: cfg.defaults.lineHeight,
        min: cfg.defaults.textMin,
        max: cfg.defaults.textMax,
        // list: false,
        strokeWidth: 4,
      },
      isPlayingAudio: false,
      brushActive: false,
    });
  }

  // ==================== Селекторы ====================
  // Реактивные потоки для подписки на изменения состояния

  /** Observable словаря всех узлов */
  readonly nodes$ = this.select((state) => state.nodes);

  /** Observable массива ID выделенных узлов */
  readonly selectedIds$ = this.select((state) => state.selectedIds);

  /** Observable текущего масштаба */
  readonly zoom$ = this.select((state) => state.zoom);

  /** Observable текущих UI-настроек */
  readonly ui$ = this.select((state) => state.ui);

  /** Observable состояния привязки к сетке */
  readonly snapEnabled$ = this.select((state) => state.snapEnabled);

  /** Observable состояния направляющих */
  readonly guidesEnabled$ = this.select((state) => state.guidesEnabled);

  /** Observable состояния режима кисти */
  readonly brushActive$ = this.select((state) => !!state.brushActive);

  /**
   * Получает синхронный снимок состояния.
   *
   * Используется для получения текущего значения без подписки на Observable.
   * Полезно в синхронных обработчиках событий.
   *
   * @param project - Функция проекции для выбора нужной части состояния
   * @returns Текущее значение
   */
  snapshot<T>(project: (state: EditorViewModel) => T): T {
    let value!: T;
    this.select(project).pipe().subscribe((projectedValue) => (value = projectedValue)).unsubscribe();
    return value;
  }

  // ==================== Методы обновления ====================
  // Updater-методы для изменения состояния

  /** Устанавливает масштаб */
  readonly setZoom = this.updater<number>((state, zoom) => ({ ...state, zoom }));

  /** Включает/выключает привязку к сетке */
  readonly setSnap = this.updater<boolean>((state, snapEnabled) => ({ ...state, snapEnabled }));

  /** Включает/выключает направляющие линии */
  readonly setGuides = this.updater<boolean>((state, guidesEnabled) => ({ ...state, guidesEnabled }));

  /** Обновляет UI-настройки (частичное обновление) */
  readonly setUI = this.updater<Partial<UiTextStyles>>((state, patch) => ({
    ...state,
    ui: { ...state.ui, ...patch }
  }));

  /** Устанавливает выделенные узлы */
  readonly setSelection = this.updater<string[]>((state, ids) => ({ ...state, selectedIds: ids }));

  /** Добавляет новый узел в хранилище */
  readonly addNode = this.updater<NodeState>((state, node) => ({
    ...state,
    nodes: { ...state.nodes, [node.id]: node },
    order: [...state.order, node.id],
  }));

  /** Удаляет узел из хранилища */
  readonly removeNode = this.updater<string>((state, nodeId) => {
    const { [nodeId]: _removed, ...remainingNodes } = state.nodes;
    return {
      ...state,
      nodes: remainingNodes,
      order: state.order.filter((id) => id !== nodeId),
      selectedIds: state.selectedIds.filter((id) => id !== nodeId),
    };
  });

  /** Изменяет порядок узлов (z-индекс) */
  readonly reorder = this.updater<string[]>((state, order) => ({ ...state, order }));

  /** Устанавливает состояние режима кисти */
  readonly setBrushActive = this.updater<boolean>((state, brushActive) => ({ ...state, brushActive }));
}
