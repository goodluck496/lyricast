# Карта Electron-интеграции

## Базовые файлы

- `apps/electron/src/app/api/main.preload.ts`
- `apps/electron/src/app/api/svc.protocol.ts`
- `libs/common-electron/src/lib/context-bridge.types.ts`
- `libs/common-browser/src/lib/services/window.service.ts`
- `libs/common-browser/src/lib/services/bridge.service.ts`

## Что здесь важно

- Browser не должен напрямую использовать Electron API, только preload surface.
- `contextBridge.exposeInMainWorld('electron', ...)` задает публичный контракт.
- `svc://` проксирует запросы из browser в worker-backed backend через main process.
- Ошибки в IPC и protocol-level коде часто проявляются далеко от места поломки.

## Частые ошибки

- Добавить метод в preload, но забыть обновить типы или browser consumer.
- Хардкодить прямые HTTP URL вместо `svc://`.
- Сломать проксирование заголовков, особенно auth.
- Менять window flow без проверки сценариев casting и secondary windows.
