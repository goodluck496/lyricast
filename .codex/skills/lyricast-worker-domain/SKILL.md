---
name: lyricast-worker-domain
description: Добавляйте и изменяйте worker-backed backend-функциональность в монорепозитории LyriCast. Используйте этот скилл, когда нужно создать или поменять worker app в apps/workers, Nest domain в libs/domains, записи регистрации worker, build/start scripts или любую worker-to-Electron интеграцию, которую легко сломать одним забытым шагом регистрации.
---

# LyriCast Worker Domain

Используйте этот скилл всякий раз, когда задача затрагивает `apps/workers`, `libs/domains` или регистрацию воркеров.

## Обязательное предупреждение

Текущий flow регистрации воркеров хрупкий и в будущем просится на рефакторинг. Пока этот рефакторинг не сделан, считайте добавление нового воркера незавершенным, пока явно не проверены все точки регистрации из `references/worker-checklist.md`.

## Порядок работы

1. До начала правок прочитайте `references/worker-checklist.md`.
2. Найдите ближайшую существующую пару worker/domain и зеркальте ее.
3. Реализуйте domain logic в `libs/domains/*`.
4. Держите bootstrap worker app тонким: он должен в основном создавать Nest app и сообщать о готовности.
5. Пропишите регистрацию воркера во всех обязательных точках до завершения задачи.
6. Если воркер отдает HTTP для browser, проверьте путь через `svc://` и data-access слой.

## Правила

- Не прячьте worker logic в Electron main process, если ей место в domain или worker app.
- Держите `main.ts` воркера сфокусированным на bootstrap, `ValidationPipe`, startup и dispose handling.
- Переиспользуйте существующие `WorkerSpec` паттерны и naming conventions.
- Обновляйте scripts и registry entries в том же change set, что и сам воркер.
- Явно отмечайте пропущенные или дублирующиеся registration points как технический долг.

## Финальный self-check

- Worker app существует и собирается.
- Domain module существует и подключен в worker bootstrap.
- Worker registry/spec обновлен.
- Нужные `package.json` scripts обновлены.
- Любой browser `svc://` consumer или data-access client указывает на правильный worker/path.
- В финальном ответе перечислены точки регистрации, которые были затронуты.
