---
name: lyricast-data-access-contracts
description: Работайте с API-контрактами LyriCast, DTO, browser data-access сервисами и worker-backed HTTP path. Используйте этот скилл, когда меняются сущности в libs/entities, использование OpenAPI-generated client, мапперы, browser-side data-access сервисы или browser-to-worker контракт через svc:// и HTTP endpoints.
---

# LyriCast Data Access Contracts

Используйте этот скилл для задач по front-back контрактам в монорепозитории.

## Порядок работы

1. Прочитайте `references/contracts-map.md`.
2. Определите, меняет ли задача:
   - shared DTO/entity types;
   - worker/domain HTTP endpoints;
   - browser-side data-access services;
   - использование OpenAPI-generated client или мапперы.
3. Держите низкоуровневую fetch-логику в `libs/shared-browser/data-access/*`.
4. Держите общие контракты в `libs/entities`.
5. Предпочитайте явные mapper functions вместо протекания transport shapes в UI-код.
6. Если transport worker-backed, проверьте `svc://` host/path и соответствующий controller root.

## Правила

- Не связывайте Angular components напрямую с raw HTTP/OpenAPI response shapes.
- Переиспользуйте стиль мапперов из dictionary services.
- Когда задействован generated OpenAPI code, держите ручную логику в тонких wrappers вокруг generated clients.
- Сохраняйте browser-specific concerns вроде auth/base path handling внутри data-access services.
- Явно отмечайте неподдерживаемые API-комбинации, как это уже сделано в существующих сервисах.

## Финальный self-check

- Изменения DTO отражены в shared types там, где это нужно.
- Browser service маппит transport data в app-level models.
- `svc://` или base-path URL указывают на правильный backend target.
- Любое новое edge-case ограничение enforced через явную ошибку, а не через тихое некорректное поведение.
