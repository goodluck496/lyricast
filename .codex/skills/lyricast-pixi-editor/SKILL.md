---
name: lyricast-pixi-editor
description: Изменяйте и отлаживайте Pixi editor в LyriCast. Используйте этот скилл, когда задача затрагивает `libs/features/forms/src/lib/components/pixi-editor`, его providers, плагины, узлы, overlay-редактор, историю, viewport, drag/resize, сериализацию или asset-backed media внутри редактора.
---

# LyriCast Pixi Editor

Используйте этот скилл для любых нетривиальных правок в Pixi editor.

## Порядок работы

1. Прочитайте `references/pixi-map.md`.
2. Сначала определите слой правки:
   - компонент-оркестратор;
   - service;
   - plugin;
   - node;
   - overlay/html editor;
   - serializer/history.
3. По возможности вносите изменение в самый узкий слой, а не в `pixi-editor.component.ts`.
4. Если задача касается UI вокруг редактора, дополнительно загрузите `../lyricast-ui-composition/SKILL.md`.

## Правила

- Не складывайте новую бизнес-логику в гигантский `pixi-editor.component.ts`, если ее можно вынести в service/plugin/node.
- Переиспользуйте `PIXI_EDITOR_PROVIDERS()` и существующие DI tokens.
- Считайте `OverlayService`, `HistoryService`, `EditorStore` и serialization чувствительными слоями.
- При изменении поведения нод проверяйте, не ломается ли selection, overlay, snapshot, history и asset cleanup.
- Любой новый editor capability лучше встраивать как plugin/service, а не как разросшийся `switch` в компоненте.

## Чеклист

- Изменение попало в правильный слой?
- История undo/redo осталась корректной?
- Overlay/text editing не сломан?
- Asset/object URL cleanup не потерян?
- Snapshot/export/serialization продолжают работать?

## Что должно получиться

- В финальном ответе нужно назвать затронутый слой editor architecture.
- Для сложных правок стоит указывать, какой существующий plugin/service был взят за образец.
