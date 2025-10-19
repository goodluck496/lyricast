import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Интерфейс для команды, которую можно отменить и повторить.
 * 
 * Каждая команда должна реализовывать методы execute и undo,
 * чтобы поддерживать историю изменений.
 */
export interface HistoryCommand {
  /** Тип команды для идентификации */
  type: string;
  
  /** Выполнить команду */
  execute(): void;
  
  /** Отменить команду */
  undo(): void;
  
  /** Описание команды для отладки (опционально) */
  description?: string;
}

/**
 * Сервис управления историей изменений (Undo/Redo).
 * 
 * Хранит стек выполненных команд и позволяет перемещаться
 * по истории, отменяя и повторяя действия пользователя.
 */
@Injectable()
export class HistoryService {
  /** Максимальное количество команд в истории */
  private readonly MAX_HISTORY_SIZE = 100;
  
  /** Стек выполненных команд */
  private history: HistoryCommand[] = [];
  
  /** Текущая позиция в истории */
  private currentIndex = -1;
  
  /** Observable для отслеживания возможности отмены */
  private canUndoSubject = new BehaviorSubject<boolean>(false);
  readonly canUndo$ = this.canUndoSubject.asObservable();
  
  /** Observable для отслеживания возможности повтора */
  private canRedoSubject = new BehaviorSubject<boolean>(false);
  readonly canRedo$ = this.canRedoSubject.asObservable();
  
  /**
   * Выполняет команду и добавляет её в историю.
   * 
   * При добавлении новой команды все команды после текущей позиции
   * удаляются (как в стандартном поведении Undo/Redo).
   * 
   * @param command - Команда для выполнения
   */
  execute(command: HistoryCommand): void {
    // Выполняем команду
    command.execute();
    
    // Удаляем все команды после текущей позиции
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Добавляем новую команду
    this.history.push(command);
    this.currentIndex++;
    
    // Ограничиваем размер истории
    if (this.history.length > this.MAX_HISTORY_SIZE) {
      this.history.shift();
      this.currentIndex--;
    }
    
    this.updateState();
  }
  
  /**
   * Отменяет последнюю выполненную команду.
   * 
   * @returns true, если команда была отменена, false - если отменять нечего
   */
  undo(): boolean {
    if (!this.canUndo()) {
      return false;
    }
    
    const command = this.history[this.currentIndex];
    command.undo();
    this.currentIndex--;
    
    this.updateState();
    return true;
  }
  
  /**
   * Повторяет отменённую команду.
   * 
   * @returns true, если команда была повторена, false - если повторять нечего
   */
  redo(): boolean {
    if (!this.canRedo()) {
      return false;
    }
    
    this.currentIndex++;
    const command = this.history[this.currentIndex];
    command.execute();
    
    this.updateState();
    return true;
  }
  
  /**
   * Проверяет, можно ли отменить команду.
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }
  
  /**
   * Проверяет, можно ли повторить команду.
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }
  
  /**
   * Очищает всю историю команд.
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.updateState();
  }
  
  /**
   * Получает текущий размер истории.
   */
  getHistorySize(): number {
    return this.history.length;
  }
  
  /**
   * Получает текущую позицию в истории.
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }
  
  /**
   * Получает список всех команд в истории (для отладки).
   */
  getHistory(): ReadonlyArray<HistoryCommand> {
    return this.history;
  }
  
  /**
   * Обновляет состояние Observable для UI.
   */
  private updateState(): void {
    this.canUndoSubject.next(this.canUndo());
    this.canRedoSubject.next(this.canRedo());
  }
}
