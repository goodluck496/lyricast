# Карта Pixi editor

## Базовые файлы

- `libs/features/forms/src/lib/components/pixi-editor/pixi-editor.component.ts`
- `libs/features/forms/src/lib/components/pixi-editor/pixi-editor.providers.ts`
- `libs/features/forms/src/lib/components/pixi-editor/services/overlay.service.ts`
- `libs/features/forms/src/lib/components/pixi-editor/services/history.service.ts`
- `libs/features/forms/src/lib/components/pixi-editor/services/editor-serializer.service.ts`

## Архитектурные слои

- `pixi-editor.component.ts`: orchestration, wiring, host lifecycle.
- `services/*`: состояние, viewport, overlay, drag/resize, history, serializer.
- `plugins/*`: редакторские capabilities по типам операций.
- `nodes/*`: runtime-модель объектов сцены.

## Куда вносить правки

- Новый способ редактирования: чаще `OverlayService` или отдельный service.
- Новая операция пользователя: чаще plugin + service.
- Новое поведение объекта сцены: `nodes/*`.
- DI/configuration changes: `pixi-editor.providers.ts`.

## Частые ошибки

- Править только UI-состояние и забыть про history/serialization.
- Добавлять логику в компонент, хотя рядом уже есть service/plugin для этого слоя.
- Не учесть cleanup object URL или overlay teardown.
