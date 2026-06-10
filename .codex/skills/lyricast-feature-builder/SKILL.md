---
name: lyricast-feature-builder
description: Создавайте и обновляйте Angular feature-модули в монорепозитории LyriCast по существующим проектным паттернам. Используйте этот скилл, когда нужно добавить страницу в libs/features, подключить маршруты в apps/browser, завести feature-local state/effects или повторить существующую композицию page/sidebar/casting вместо изобретения новой структуры.
---

# LyriCast Feature Builder

Используйте этот скилл для feature-задач в Angular browser-приложении.

## Порядок работы

1. Сначала прочитайте `references/feature-patterns.md`, прежде чем предлагать структурные изменения.
2. Новые пользовательские страницы размещайте в `libs/features/*` как feature library, а не прямо в `apps/browser`.
3. Держите компоненты сфокусированными на отображении и wiring взаимодействий.
4. Бизнес-логику, orchestration и межкомпонентную координацию выносите в соседние сервисы, store или effects.
5. Переиспользуйте существующие паттерны route/provider/icon registration/`canDeactivate` из ближайших feature.
6. Если задача затрагивает casting, дополнительно загружайте `../lyricast-casting-flow/SKILL.md`.
7. Если задача затрагивает API и контракты, дополнительно загружайте `../lyricast-data-access-contracts/SKILL.md`.

## Правила

- Предпочитайте расширение существующей feature, а не создание параллельной структуры.
- Сначала добавляйте маршруты в feature library, потом подключайте их из `apps/browser/src/app/app.routes.ts`.
- Переиспользуйте `PrimeNG`, `Angular Material/CDK` и `libs/ui-lib`, прежде чем вводить новые UI-абстракции.
- Избегайте `@Input/@Output`, если лучше ложатся существующие DI/store-паттерны.
- Держите store/effects providers рядом с тем route, который ими владеет.
- Сохраняйте текущий стиль именования для `pages`, `components`, `services`, `types`.

## Что должно получиться

- Код feature живет под `libs/features/<feature-name>`.
- В browser shell остаются только route integration и верхнеуровневая композиция.
- Любая новая wiring-логика для store/effects повторяет соседние feature-примеры.
- В финальном ответе нужно назвать существующую feature, которая была основным шаблоном.
