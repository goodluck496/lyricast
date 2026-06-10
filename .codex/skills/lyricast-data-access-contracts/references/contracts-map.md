# Карта контрактов

## Базовые файлы

- `libs/entities/src/index.ts`
- `libs/shared-browser/data-access/dictionaries/src/songs-dictionary-api.service.ts`
- `libs/shared-browser/data-access/assets/src/assets-api.service.ts`
- `apps/electron/src/app/api/svc.protocol.ts`
- `libs/domains/asset-domain/src/lib/asset-domain.service.ts`

## Паттерны для переиспользования

- Wrapper service вокруг generated OpenAPI client для browser-specific behavior.
- Mapper functions, которые конвертируют transport unions/DTO в app-level interfaces.
- Явные unsupported-case guards вместо частичных реализаций.
- `svc://<worker-host>` URL для worker-backed browser HTTP access.

## Размещение

- Shared DTOs/interfaces: `libs/entities`
- Browser HTTP/data-access: `libs/shared-browser/data-access/*`
- Domain controllers/services: `libs/domains/*`
- OpenAPI generated artifacts: `libs/openapi/*`

## Частые ошибки

- Возврат generated DTO напрямую в feature components.
- Хардкод HTTP URL в обход `BASE_PATH` или `svc://`.
- Смешивание browser-only concerns с shared entities.
