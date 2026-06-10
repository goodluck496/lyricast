# Чеклист по воркерам

## Прочитать сначала

- `libs/worker-kit/src/lib/base-worker-manager.ts`
- `libs/worker-kit/src/lib/workers-registry.ts`
- `apps/electron/src/app/api/svc.protocol.ts`
- `apps/workers/songs-service/src/main.ts`
- `apps/workers/songs-service/project.json`

## Обязательные точки регистрации

При добавлении нового воркера проверьте каждый пункт явно:

1. `apps/workers/<worker-name>/src/main.ts`
2. `apps/workers/<worker-name>/project.json`
3. domain module in `libs/domains/<domain-name>`
4. worker spec/registry usage in Electron bootstrap or worker-kit integration
5. build/watch/start scripts in `package.json`
6. any `svc://<worker-host>` usage or browser data-access client
7. any env/path assumptions for assets, db, or user data

## Почему этот скилл строгий

- Текущий flow легко сломать, забыв один registration step.
- Ошибки часто всплывают поздно: как runtime `worker not found`, missing route или тихие proxy issues.
- Считать “воркер компилируется” достаточным критерием нельзя; полнота регистрации важнее.

## Bootstrap-паттерн

- Создать Nest app через `ExpressAdapter`.
- Поднять listener на `127.0.0.1` на случайном порту.
- Отправить `{ t: 'ready', port }` в `parentPort`.
- Обработать `{ t: 'dispose' }`.
- Возвращать подробные startup errors обратно в parent worker manager.
