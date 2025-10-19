import { Container } from 'pixi.js';
import { HistoryCommand } from './history.service';
import { EditorStore, NodeState } from './editor-store.service';
import { NodeBase } from '../core';
import { TextNode } from '../nodes';
import { CommandBusService } from './command-bus.service';

/**
 * Команда добавления узла на сцену.
 */
export class AddNodeCommand implements HistoryCommand {
  readonly type = 'ADD_NODE';
  
  constructor(
    private nodeState: NodeState,
    private world: Container,
    private store: EditorStore
  ) {}
  
  execute(): void {
    this.world.addChild(this.nodeState.ref);
    this.store.addNode(this.nodeState);
  }
  
  undo(): void {
    this.world.removeChild(this.nodeState.ref);
    this.store.removeNode(this.nodeState.id);
  }
  
  get description(): string {
    return `Добавить ${this.nodeState.type} узел`;
  }
}

/**
 * Команда удаления узла со сцены.
 */
export class RemoveNodeCommand implements HistoryCommand {
  readonly type = 'REMOVE_NODE';
  
  constructor(
    private nodeState: NodeState,
    private world: Container,
    private store: EditorStore,
    private worldIndex: number
  ) {}
  
  execute(): void {
    this.world.removeChild(this.nodeState.ref);
    this.store.removeNode(this.nodeState.id);
  }
  
  undo(): void {
    // Восстанавливаем узел на прежнюю позицию в иерархии
    this.world.addChildAt(this.nodeState.ref, this.worldIndex);
    this.store.addNode(this.nodeState);
  }
  
  get description(): string {
    return `Удалить ${this.nodeState.type} узел`;
  }
}

/**
 * Команда перемещения узла.
 */
export class MoveNodeCommand implements HistoryCommand {
  readonly type = 'MOVE_NODE';
  
  constructor(
    private nodeRef: NodeBase,
    private oldX: number,
    private oldY: number,
    private newX: number,
    private newY: number
  ) {}
  
  execute(): void {
    this.nodeRef.x = this.newX;
    this.nodeRef.y = this.newY;
  }
  
  undo(): void {
    this.nodeRef.x = this.oldX;
    this.nodeRef.y = this.oldY;
  }
  
  get description(): string {
    return `Переместить узел`;
  }
}

/**
 * Команда изменения размера узла.
 */
export class ResizeNodeCommand implements HistoryCommand {
  readonly type = 'RESIZE_NODE';
  
  constructor(
    private nodeRef: NodeBase,
    private oldWidth: number,
    private oldHeight: number,
    private oldX: number,
    private oldY: number,
    private newWidth: number,
    private newHeight: number,
    private newX: number,
    private newY: number
  ) {}
  
  execute(): void {
    this.nodeRef.applyBoxSize(this.newWidth, this.newHeight);
    this.nodeRef.x = this.newX;
    this.nodeRef.y = this.newY;
  }
  
  undo(): void {
    this.nodeRef.applyBoxSize(this.oldWidth, this.oldHeight);
    this.nodeRef.x = this.oldX;
    this.nodeRef.y = this.oldY;
  }
  
  get description(): string {
    return `Изменить размер узла`;
  }
}

/**
 * Команда поворота узла.
 */
export class RotateNodeCommand implements HistoryCommand {
  readonly type = 'ROTATE_NODE';
  
  constructor(
    private nodeRef: NodeBase,
    private oldRotation: number,
    private newRotation: number
  ) {}
  
  execute(): void {
    this.nodeRef.rotation = this.newRotation;
  }
  
  undo(): void {
    this.nodeRef.rotation = this.oldRotation;
  }
  
  get description(): string {
    return `Повернуть узел`;
  }
}

/**
 * Команда изменения z-индекса узлов.
 */
export class ReorderNodesCommand implements HistoryCommand {
  readonly type = 'REORDER_NODES';
  
  constructor(
    private world: Container,
    private oldOrder: Array<{ node: NodeBase; index: number }>,
    private newOrder: Array<{ node: NodeBase; index: number }>
  ) {}
  
  execute(): void {
    this.applyOrder(this.newOrder);
  }
  
  undo(): void {
    this.applyOrder(this.oldOrder);
  }
  
  private applyOrder(order: Array<{ node: NodeBase; index: number }>): void {
    // Сортируем по индексу для правильного восстановления порядка
    const sorted = [...order].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      this.world.setChildIndex(item.node, item.index);
    }
  }
  
  get description(): string {
    return `Изменить порядок узлов`;
  }
}

/**
 * Команда изменения выделения.
 */
export class SelectionCommand implements HistoryCommand {
  readonly type = 'SELECTION';
  
  constructor(
    private oldSelection: string[],
    private newSelection: string[],
    private bus: CommandBusService
  ) {}
  
  execute(): void {
    this.bus.emit({ t: 'SELECT', ids: this.newSelection });
  }
  
  undo(): void {
    this.bus.emit({ t: 'SELECT', ids: this.oldSelection });
  }
  
  get description(): string {
    return `Изменить выделение`;
  }
}

/**
 * Батч-команда для группировки нескольких команд в одну.
 * Полезно для операций, которые состоят из нескольких шагов.
 */
export class BatchCommand implements HistoryCommand {
  readonly type = 'BATCH';
  
  constructor(
    private commands: HistoryCommand[],
    public description: string = 'Групповая операция'
  ) {}
  
  execute(): void {
    for (const command of this.commands) {
      command.execute();
    }
  }
  
  undo(): void {
    // Отменяем команды в обратном порядке
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}

/**
 * Команда дублирования узлов.
 */
export class DuplicateNodesCommand implements HistoryCommand {
  readonly type = 'DUPLICATE_NODES';
  
  constructor(
    private addedNodes: NodeState[],
    private world: Container,
    private store: EditorStore,
    private bus: CommandBusService
  ) {}
  
  execute(): void {
    const newIds: string[] = [];
    for (const nodeState of this.addedNodes) {
      this.world.addChild(nodeState.ref);
      this.store.addNode(nodeState);
      newIds.push(nodeState.id);
    }
    this.bus.emit({ t: 'SELECT', ids: newIds });
  }
  
  undo(): void {
    for (const nodeState of this.addedNodes) {
      this.world.removeChild(nodeState.ref);
      this.store.removeNode(nodeState.id);
    }
    this.bus.emit({ t: 'SELECT', ids: [] });
  }
  
  get description(): string {
    return `Дублировать узлы (${this.addedNodes.length})`;
  }
}

/**
 * Команда изменения текста в TextNode.
 */
export class ChangeTextCommand implements HistoryCommand {
  readonly type = 'CHANGE_TEXT';
  
  constructor(
    private textNode: TextNode,
    private oldText: string,
    private newText: string
  ) {}
  
  execute(): void {
    this.textNode.text = this.newText;
    void this.textNode.layout();
  }
  
  undo(): void {
    this.textNode.text = this.oldText;
    void this.textNode.layout();
  }
  
  get description(): string {
    return `Изменить текст`;
  }
}
