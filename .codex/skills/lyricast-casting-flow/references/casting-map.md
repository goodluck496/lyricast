# Карта casting flow

## Базовые файлы

- `libs/common-browser/src/lib/store/casting-flow.ts`
- `libs/common-browser/src/lib/services/bridge.service.ts`
- `libs/common-browser/src/lib/services/window.service.ts`
- `apps/electron/src/app/api/main.preload.ts`
- `apps/browser/src/app/app.routes.ts`

## Конкретные feature-примеры

- `libs/features/song-feature/src/lib/components/song-sidebar/song-sidebar.component.ts`
- `libs/features/song-feature/src/song-feature.routes.ts`
- `libs/features/bible-feature/src/lib/lib.routes.ts`
- `libs/features/free-slide-feature/src/lib/lib.routes.ts`

## Ментальная модель

1. Main window dispatch'ит feature action.
2. Feature effects или sidebar service при необходимости открывают casting Electron window.
3. Browser app открывает feature-specific `/casting` route внутри этого окна.
4. После readiness bridge events передают состояние слайдов и навигацию.
5. Stop/pause events должны оставаться корректными при выходе из feature и закрытии окна.

## Частые точки поломки

- Route существует в `apps/browser`, но отсутствует в feature library.
- У casting route не хватает `provideState` или `provideEffects`.
- Имя bridge event больше не совпадает с `extractEventName(...)`.
- Окно открывается, но handshake через `openedPage` или `castingStarted` так и не завершается.
