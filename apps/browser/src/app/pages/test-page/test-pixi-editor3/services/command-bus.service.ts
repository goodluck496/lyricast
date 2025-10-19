import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { UiTextStyles } from '../types';
import { ShapeType } from '../enums';

/**
 * Сервис шины команд редактора.
 * 
 * Реализует паттерн Event Bus для обмена командами между компонентами редактора.
 * Все взаимодействия (создание узлов, изменение стилей, операции с выделением)
 * проходят через эту шину команд.
 */

/**
 * Объединенный тип всех команд редактора.
 * 
 * Каждая команда представляет собой объект с полем 't' (тип команды)
 * и дополнительными параметрами, специфичными для этой команды.
 * 
 * Категории команд:
 * - Выделение: SELECT
 * - Создание узлов: ADD_TEXT, ADD_IMAGE, ADD_VIDEO, ADD_IFRAME, ADD_SHAPE, START_BRUSH
 * - Группировка: GROUP, UNGROUP
 * - Операции с узлами: DELETE, DUPLICATE, MOVE, RESIZE
 * - Стилизация: APPLY_STYLE, SET_*_BACKGROUND, CLEAR_*_BACKGROUND, SET_*_FILL
 * - Управление видом: ZOOM, SNAP, GUIDES
 * - Z-индекс: BRING_TO_FRONT, SEND_TO_BACK, BRING_FORWARD, SEND_BACKWARD
 * - Аудио: SET_AUDIO, PLAY_AUDIO, PAUSE_AUDIO
 * - Интерактивность: ENABLE_IFRAME_INTERACTIVE
 * - Буфер обмена: PASTE_CLIPBOARD
 */
export type EditorCommand =
  // Команды выделения
  | { t: 'SELECT'; ids: string[] }  // Установить выделенные узлы
  
  // Команды создания узлов
  | { t: 'ADD_TEXT'; x: number; y: number; w?: number; h?: number; text?: string }  // Создать текстовый блок
  | { t: 'ADD_IMAGE'; url: string; x?: number; y?: number; w?: number; h?: number }  // Создать изображение
  | { t: 'ADD_VIDEO'; url: string; x?: number; y?: number; w?: number; h?: number }  // Создать видео
  | { t: 'ADD_IFRAME'; url: string; x?: number; y?: number; w?: number; h?: number }  // Создать iframe
  | { t: 'ADD_SHAPE'; shape: ShapeType; x: number; y: number; w?: number; h?: number }  // Создать фигуру
  | { t: 'START_BRUSH' }  // Начать рисование кистью
  
  // Команды аудио
  | { t: 'SET_AUDIO'; url?: string }  // Установить аудио-дорожку
  | { t: 'PLAY_AUDIO' | 'PAUSE_AUDIO' }  // Воспроизвести/приостановить аудио
  
  // Команды группировки
  | { t: 'GROUP'; ids: string[] }  // Сгруппировать узлы
  | { t: 'UNGROUP'; id: string }  // Разгруппировать узел
  
  // Команды операций с узлами
  | { t: 'DELETE'; ids?: string[] }  // Удалить узлы
  | { t: 'DUPLICATE'; ids?: string[] }  // Дублировать узлы
  | { t: 'MOVE'; id: string; x: number; y: number }  // Переместить узел
  | { t: 'RESIZE'; id: string; w: number; h: number }  // Изменить размер узла
  
  // Команды стилизации
  | { t: 'APPLY_STYLE'; patch: Partial<UiTextStyles> }  // Применить стили к выделенным узлам
  
  // Команды фона для фигур
  | { t: 'SET_SHAPE_BACKGROUND'; url: string }  // Установить фоновое изображение для фигуры
  | { t: 'CLEAR_SHAPE_BACKGROUND' }  // Очистить фон фигуры
  | { t: 'SET_SHAPE_FILL'; color: number }  // Установить цвет заливки фигуры
  
  // Команды фона для текста
  | { t: 'SET_TEXT_BACKGROUND'; url: string }  // Установить фоновое изображение для текста
  | { t: 'CLEAR_TEXT_BACKGROUND' }  // Очистить фон текста
  | { t: 'SET_TEXT_BG_COLOR'; color: number }  // Установить цвет фона текста
  
  // Команды фона для кисти
  | { t: 'SET_BRUSH_BACKGROUND'; url: string }  // Установить фоновое изображение для кисти
  | { t: 'CLEAR_BRUSH_BACKGROUND' }  // Очистить фон кисти
  
  // Команды управления видом
  | { t: 'ZOOM'; z: number }  // Изменить масштаб
  | { t: 'SNAP'; on: boolean }  // Включить/выключить привязку к сетке
  | { t: 'GUIDES'; on: boolean }  // Включить/выключить направляющие
  
  // Команды изменения z-индекса
  | { t: 'BRING_TO_FRONT' }  // Переместить на передний план
  | { t: 'SEND_TO_BACK' }  // Переместить на задний план
  | { t: 'BRING_FORWARD' }  // Переместить на один слой вперед
  | { t: 'SEND_BACKWARD' }  // Переместить на один слой назад
  
  // Команды интерактивности
  | { t: 'ENABLE_IFRAME_INTERACTIVE' }  // Включить интерактивность iframe/video
  
  // Команды буфера обмена
  | { t: 'PASTE_CLIPBOARD' };  // Вставить из буфера обмена

/**
 * Сервис шины команд редактора.
 * 
 * Использует RxJS Subject для передачи команд между UI и плагинами.
 * Все компоненты могут подписаться на поток команд и реагировать на нужные события.
 */
@Injectable()
export class CommandBusService {
  /** Внутренний Subject для публикации команд */
  private readonly commandSubject = new Subject<EditorCommand>();
  
  /** 
   * Observable поток команд, на который могут подписаться плагины и компоненты.
   * Используйте операторы RxJS (filter, map и т.д.) для обработки нужных команд.
   */
  readonly commands$ = this.commandSubject.asObservable();
  
  /**
   * Отправляет команду в шину.
   * Все подписчики получат эту команду и смогут на нее отреагировать.
   * 
   * @param command - Команда для отправки
   */
  emit(command: EditorCommand): void { 
    this.commandSubject.next(command); 
  }
}
