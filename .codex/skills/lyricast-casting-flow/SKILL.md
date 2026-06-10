---
name: lyricast-casting-flow
description: Реализуйте и отлаживайте casting-поведение LyriCast на стыке Angular, Electron и bridge-слоя. Используйте этот скилл, когда задача затрагивает второе окно, имена bridge-событий, routing casting-страниц, навигацию по слайдам, start/pause/stop-поток или синхронизацию между main и casting окнами.
---

# LyriCast Casting Flow

Используйте этот скилл для любой задачи, которая проходит через feature state, Electron окна и bridge messaging.

## Порядок работы

1. Прочитайте `references/casting-map.md`.
2. Определите, какая feature владеет casting state и action.
3. Уточните, меняется ли только feature effects или также Electron/bridge transport.
4. Держите имена событий согласованными с `actionSource` и существующей логикой извлечения bridge event name.
5. Проверьте и page mode, и casting mode routes/providers для целевой feature.
6. Если задача вручную открывает новое окно, сначала сравните ее с универсальным путем через `createCastingFlow`.

## Правила

- Предпочитайте переиспользование `createCastingFlow` из `libs/common-browser/src/lib/store/casting-flow.ts`.
- Считайте naming bridge events хрупким местом; не переименовывайте action groups без необходимости.
- Сохраняйте pause/stop-поведение в `canDeactivate` и feature exit flows.
- При добавлении casting settings проверяйте, нужно ли повторно проигрывать их после `openedPage` или `castingStarted`.
- Четко различайте:
  - opening the Electron window;
  - opening a feature page inside that window;
  - sending start/pause/slide events after readiness.

## Чеклист отладки

- Окно casting реально открыто и сохранено в state?
- Целевая feature действительно отдает `/casting` route с нужными providers?
- Bridge получает ожидаемое имя события?
- Событие не блокируется freeze/readiness-логикой?
- Main process пересылает сообщение в правильное окно и на правильную страницу?

## Что должно получиться

- Любое изменение casting должно указывать, какой feature store/effects entry point использовался.
- Любое изменение bridge должно называть полный путь события от action до Electron transport.
