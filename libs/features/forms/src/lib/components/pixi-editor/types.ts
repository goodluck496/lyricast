import { InjectionToken } from '@angular/core';
import { TextAlign } from './enums';
import { TextStyleFontWeight } from 'pixi.js';

/**
 * Типы и токены для конфигурации редактора PixiJS.
 *
 * Этот файл содержит интерфейсы для настройки редактора,
 * стилей текста и DI-токены для Angular.
 */

/**
 * Псевдоним для обратной совместимости.
 * @deprecated Используйте TextAlign из enums.ts
 */
export type Align = TextAlign;

/**
 * Стили текста для UI-контролов редактора.
 *
 * Этот интерфейс описывает все параметры стилизации текста,
 * которые могут быть изменены через панель инструментов.
 */
export interface UiTextStyles {
  /** Семейство шрифтов (например, 'Inter, system-ui, sans-serif') */
  font: string;

  actualFontSize?: number

  /** Насыщенность шрифта (например, '400', '600', '700') */
  weight:  TextStyleFontWeight;

  /** Цвет заливки в формате Pixi.js (например, 0xffffff для белого) */
  color: number;

  /** Цвет в HEX-формате для HTML input[type=color] (например, '#ffffff') */
  colorHex: string;

  /** Цвет фона текста в формате Pixi.js (например, 0xffffff) */
  bgColor?: number;

  /** Цвет фона в HEX-формате для UI */
  bgColorHex?: string;

  /** Горизонтальное выравнивание текста */
  align: TextAlign;

  /** Множитель межстрочного интервала относительно размера шрифта (например, 1.2) */
  lineHeight: number;

  /** Минимальный размер шрифта в пикселях */
  min: number;

  /** Максимальный размер шрифта в пикселях */
  max: number;

  // /** Отображать текст как маркированный список (добавляет '•' перед каждой строкой) */
  // list: boolean;
  //
  /** Ширина обводки для кисти и линий (опционально) */
  strokeWidth?: number;

  /** Вертикальное выравнивание текста */
  valign?: 'top' | 'middle' | 'bottom';
}

/**
 * Конфигурация сетки редактора.
 */
export interface GridConfig {
  /** Размер ячейки сетки в пикселях */
  size: number;

  /** Толщина линий сетки в пикселях */
  line: number;

  /** Цвет линий сетки в HEX-формате */
  color: string;

  /** Прозрачность линий сетки (0-1) */
  alpha: number;
}

/**
 * Конфигурация направляющих линий (guides).
 */
export interface GuidesConfig {
  /** Включены ли направляющие по умолчанию */
  enabled: boolean;

  /** Порог привязки к направляющим в пикселях */
  threshold: number;

  /** Цвет направляющих линий в HEX-формате */
  color: string;

  /** Прозрачность направляющих линий (0-1) */
  alpha: number;
}

/**
 * Настройки по умолчанию для текстовых узлов.
 */
export interface TextDefaults {
  /** Минимальный размер шрифта по умолчанию */
  textMin: number;

  /** Максимальный размер шрифта по умолчанию */
  textMax: number;

  /** Семейство шрифтов по умолчанию */
  family: string;

  /** Насыщенность шрифта по умолчанию */
  weight: TextStyleFontWeight;

  /** Выравнивание текста по умолчанию */
  align: TextAlign;

  /** Межстрочный интервал по умолчанию */
  lineHeight: number;

  /** Шаг изменения размера шрифта при подборе (в пикселях) */
  fitStep: number;

  /** Отступ от краев блока при подборе размера (в пикселях) */
  fitMargin: number;

  /** Окно поиска оптимального размера шрифта (в пикселях) */
  fitWindow: number;

  /** Количество шагов мертвой зоны для стабилизации подбора */
  deadbandSteps: number;
}

/**
 * Основная конфигурация редактора.
 *
 * Содержит все настройки для работы редактора: цвета, сетку,
 * привязку, направляющие и параметры по умолчанию.
 */
export interface EditorConfig {
  /** Цвет фона canvas в HEX-формате */
  background: string;

  /** Настройки сетки */
  grid: GridConfig;

  /** Шаг привязки при перемещении узлов (в пикселях) */
  dragSnap: number;

  /** Шаг привязки при изменении размера узлов (в пикселях) */
  resizeSnap: number;

  /** Настройки направляющих линий */
  guides: GuidesConfig;

  /** Настройки по умолчанию для текстовых узлов */
  defaults: TextDefaults;
}

/**
 * DI-токен для внедрения конфигурации редактора в Angular-сервисы.
 */
export const EDITOR_CONFIG = new InjectionToken<EditorConfig>('EDITOR_CONFIG');

/**
 * Конфигурация редактора по умолчанию.
 *
 * Эти значения используются при инициализации редактора,
 * если не предоставлена пользовательская конфигурация.
 */
export const DEFAULT_CONFIG: EditorConfig = {
  background: '#000000',
  grid: { size: 20, line: 1, color: '#ffffff', alpha: 0.08 },
  dragSnap: 5,
  resizeSnap: 2,
  guides: { enabled: true, threshold: 8, color: '#ddddee', alpha: 0.6 },
  defaults: {
    textMin: 16,
    textMax: 160,
    family: 'Inter, system-ui, sans-serif',
    weight: '600',
    align: 'left',
    lineHeight: 1.18,
    fitStep: 2,
    fitMargin: 8,
    fitWindow: 32,
    deadbandSteps: 1,
  },
};

/**
 * Максимальный размер шрифта для встроенного textarea-редактора (в пикселях).
 *
 * Это значение ограничивает размер шрифта в overlay-редакторе,
 * чтобы обеспечить удобство редактирования независимо от размера текста на canvas.
 */
export const INLINE_TEXTAREA_MAX_FONT_PX = 16;
