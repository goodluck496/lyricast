# UI-паттерны

## Базовые файлы

- `apps/browser/src/app/app.config.ts`
- `libs/ui-lib/src/index.ts`
- `libs/ui-lib/src/lib/components/export-notifications/export-notifications.component.ts`
- `libs/ui-lib/src/lib/components/song-dictionary-card/song-dictionary-card.component.ts`
- `libs/features/song-feature/src/lib/pages/song-page/song-page.component.ts`
- `libs/features/free-slide-feature/src/lib/pages/free-slide-page/free-slide.component.ts`

## Что копировать

- Standalone components как базовый формат.
- Сборку UI из PrimeNG modules и при необходимости Angular Material/CDK.
- Повторно используемые примитивы и feature-neutral блоки выносить в `libs/ui-lib`.
- Feature-specific page composition оставлять внутри feature library.

## Частые ошибки

- Создать custom directive/component, хотя аналог уже есть в `ui-lib` или PrimeNG.
- Положить reusable UI block в `apps/browser` или конкретную feature.
- Смешать UI и orchestration там, где рядом уже есть service/store pattern.
