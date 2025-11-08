# Система истории изменений (Undo/Redo)

## Обзор

Редактор теперь поддерживает полную систему истории изменений с возможностью отмены и повтора действий.

## Горячие клавиши

- **Ctrl+Z** (или Cmd+Z на Mac) - Отменить последнее действие
- **Ctrl+Shift+Z** или **Ctrl+Y** (Cmd+Shift+Z или Cmd+Y на Mac) - Повторить отменённое действие

## Архитектура

### HistoryService

Основной сервис для управления историей команд:

```typescript
@Injectable()
export class HistoryService {
  // Выполнить команду и добавить в историю
  execute(command: HistoryCommand): void
  
  // Отменить последнюю команду
  undo(): boolean
  
  // Повторить отменённую команду
  redo(): boolean
  
  // Проверить возможность отмены/повтора
  canUndo(): boolean
  canRedo(): boolean
  
  // Observable для UI
  canUndo$: Observable<boolean>
  canRedo$: Observable<boolean>
}
```

### HistoryCommand

Интерфейс для команд, поддерживающих отмену:

```typescript
export interface HistoryCommand {
  type: string;
  execute(): void;
  undo(): void;
  description?: string;
}
```

## Доступные команды

### AddNodeCommand
Добавление узла на сцену.

```typescript
const command = new AddNodeCommand(nodeState, world, store);
history.execute(command);
```

### RemoveNodeCommand
Удаление узла со сцены.

```typescript
const command = new RemoveNodeCommand(nodeState, world, store, worldIndex);
history.execute(command);
```

### MoveNodeCommand
Перемещение узла.

```typescript
const command = new MoveNodeCommand(
  nodeRef,
  oldX, oldY,
  newX, newY
);
history.execute(command);
```

### ResizeNodeCommand
Изменение размера узла.

```typescript
const command = new ResizeNodeCommand(
  nodeRef,
  oldWidth, oldHeight, oldX, oldY,
  newWidth, newHeight, newX, newY
);
history.execute(command);
```

### RotateNodeCommand
Поворот узла.

```typescript
const command = new RotateNodeCommand(nodeRef, oldRotation, newRotation);
history.execute(command);
```

### ReorderNodesCommand
Изменение z-индекса узлов.

```typescript
const command = new ReorderNodesCommand(world, oldOrder, newOrder);
history.execute(command);
```

### SelectionCommand
Изменение выделения.

```typescript
const command = new SelectionCommand(oldSelection, newSelection, bus);
history.execute(command);
```

### DuplicateNodesCommand
Дублирование узлов.

```typescript
const command = new DuplicateNodesCommand(addedNodes, world, store, bus);
history.execute(command);
```

### BatchCommand
Группировка нескольких команд в одну.

```typescript
const commands = [
  new MoveNodeCommand(...),
  new ResizeNodeCommand(...),
];
const batch = new BatchCommand(commands, 'Переместить и изменить размер');
history.execute(batch);
```

## Интеграция с существующими операциями

### Пример: Добавление узла с историей

```typescript
// Создаём узел
const textNode = new TextNode();
textNode.x = 100;
textNode.y = 80;

// Создаём состояние узла
const nodeState: NodeState = {
  id: textNode.id,
  type: 'text',
  ref: textNode,
};

// Выполняем команду через историю
const command = new AddNodeCommand(nodeState, this.world, this.store);
this.history.execute(command);
```

### Пример: Перемещение с историей

```typescript
// В DragResizeService при завершении перемещения
onDragEnd(node: NodeBase, startX: number, startY: number) {
  if (node.x !== startX || node.y !== startY) {
    const command = new MoveNodeCommand(
      node,
      startX, startY,
      node.x, node.y
    );
    this.history.execute(command);
  }
}
```

## Ограничения

- Максимальный размер истории: 100 команд
- При выполнении новой команды все команды после текущей позиции удаляются
- Некоторые операции (например, изменение UI-настроек) не сохраняются в истории

## Планы на будущее

1. Интеграция с DragResizeService для автоматического сохранения перемещений и изменений размера
2. Сохранение истории в localStorage для восстановления после перезагрузки
3. Визуальный индикатор истории в UI
4. Поддержка именованных контрольных точек (checkpoints)
5. Экспорт/импорт истории для отладки
