---
name: lyricast-ui-composition
description: Собирайте и правьте Angular UI в LyriCast с использованием существующих PrimeNG, Angular Material/CDK и `libs/ui-lib` паттернов. Используйте этот скилл, когда создаются standalone components, page layouts, reusable browser UI blocks, формы, диалоги, notifications или composition-слой вокруг feature pages.
---

# LyriCast UI Composition

Используйте этот скилл для UI-правок в browser-приложении и feature libraries.

## Порядок работы

1. Прочитайте `references/ui-patterns.md`.
2. Сначала проверьте, есть ли подходящий компонент в `libs/ui-lib`.
3. Если готового компонента нет, соберите UI из `PrimeNG` и `Angular Material/CDK`.
4. Только после этого добавляйте новый reusable UI block.
5. Если правка затрагивает feature structure, дополнительно загрузите `../lyricast-feature-builder/SKILL.md`.

## Правила

- Предпочитайте standalone components в существующем стиле проекта.
- Не изобретайте новый кастомный компонент или директиву, если задачу закрывает `PrimeNG`, `Material/CDK` или `libs/ui-lib`.
- Компоненты должны оставаться компактными и декомпозированными.
- По возможности не тащите бизнес-логику в компонент; используйте сервисы и store.
- Для общих повторно используемых блоков смотрите `libs/ui-lib`, а не `apps/browser`.

## Чеклист

- Уже есть компонент в `libs/ui-lib`?
- Можно собрать задачу на `PrimeNG` или `Material` без нового велосипеда?
- Компонент standalone и в стиле соседнего кода?
- Бизнес-логика не утекла в шаблон или компонент без причины?
- Если блок стал общим, его место точно не в feature, а в `ui-lib`?

## Что должно получиться

- В финальном ответе нужно назвать, какие существующие UI-паттерны или компоненты были переиспользованы.
- Если был создан новый reusable UI block, нужно явно указать, почему существующих средств не хватило.
