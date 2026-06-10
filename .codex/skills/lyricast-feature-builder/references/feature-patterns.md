# Паттерны feature

## Прочитать сначала

- `apps/browser/src/app/app.routes.ts`
- `libs/features/song-feature/src/song-feature.routes.ts`
- `libs/features/bible-feature/src/lib/lib.routes.ts`
- `libs/features/free-slide-feature/src/lib/lib.routes.ts`
- `libs/features/quiz/src/lib/lib.routes.ts`

## Что копировать

- Browser app держит только top-level routing и redirects.
- Feature libraries владеют своими внутренними route, route providers и feature-local state/effects.
- Casting-режим и обычный page-режим обычно разделены на отдельные route внутри одной feature.
- Отключение sidebar и похожие shell-задачи переключаются через `MainComponentService` в route guards, когда это нужно.

## Куда что класть

- New page visible in the main app: `libs/features/<feature>/src/...`
- Shared browser data fetching: `libs/shared-browser/data-access/*`
- Shared DTO/contracts: `libs/entities`
- Cross-window/cross-feature browser services: `libs/common-browser`

## Критерий качества

- Не переносите бизнес-логику в шаблоны компонентов или lifecycle-код, если для нее лучше подходит соседний сервис.
- Не изобретайте новый route/provider-паттерн, если одна из существующих feature route-конфигураций уже подходит под задачу.
