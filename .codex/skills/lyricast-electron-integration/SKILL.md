---
name: lyricast-electron-integration
description: Реализуйте и отлаживайте Electron-интеграцию в LyriCast. Используйте этот скилл, когда задача затрагивает preload, contextBridge, ipcRenderer, работу с окнами, custom protocol `svc://`, проброс событий между browser и main process или связку Electron с worker-backed backend.
---

# LyriCast Electron Integration

Используйте этот скилл для задач на стыке Angular browser app и Electron main/preload слоев.

## Порядок работы

1. Прочитайте `references/electron-map.md`.
2. Определите, меняется ли:
   - preload API;
   - main process обработка окна или IPC;
   - `svc://` proxy;
   - browser-side код, который пользуется Electron API.
3. Если задача касается casting или второго окна, дополнительно загрузите `../lyricast-casting-flow/SKILL.md`.
4. Если задача касается worker-backed HTTP, дополнительно загрузите `../lyricast-worker-domain/SKILL.md`.

## Правила

- Не обходите preload прямым доступом к Electron из browser-кода.
- Держите публичный browser API узким и типизированным через `@lyri-cast/common-electron`.
- Для worker-backed HTTP сохраняйте путь через `svc://`, а не подменяйте его прямыми localhost URL.
- При правках `svc.protocol.ts` считайте CORS, auth header forwarding и body handling чувствительными местами.
- Любое изменение контракта preload должно быть синхронизировано с browser-side потребителями.

## Чеклист отладки

- Browser вызывает метод через preload, а не через неявный глобал?
- Событие или IPC-канал существует с обеих сторон?
- Window open/close flow не нарушен?
- `svc://` host совпадает с зарегистрированным worker name?
- Заголовки авторизации и тело запроса действительно доходят до worker backend?

## Что должно получиться

- Изменения в Electron ограничены правильным слоем: browser, preload, main process, protocol proxy.
- В финальном ответе нужно назвать измененный слой и точки интеграции.
