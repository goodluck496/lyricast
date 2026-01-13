# PROGRESS: единый экспорт справочников и нотификации

## Контекст
- Требуется заменить старую загрузку JSON справочников в settings вкладке "Справочники" `apps/browser/src/app/components/song-dictionaries-manager/song-dictionaries-manager.component.ts` на новый API, добавить пуллинг и нотификации.
  - [x] браузерное приложение стартует в Electron — API доступно только через воркеры по протоколу `svc://`.
  - [ ] в dictionary-client API доступен по протоколу `http://`.
  - [x] в воркере придётся добавить ручки опроса и отмены запросов скачивания.
- Компонент нотификаций экспорта сейчас живёт в `apps/dictionary-client` и использует локальный `ExportService`.
- Нужен перенос нотификаций в shared для переиспользования в разных приложениях.
- В Electron-приложении происходит только получение и автоматическое применение справочников; для загружаемого справочника нужен progress-bar (проценты), при этом не нужно перерисовывать весь список при обновлении одного элемента.

## План работ (чек-лист)
- [x] Общий сервис экспортов `ExportJobsService` в `libs/shared-browser/data-access/dictionaries`
  - [x] Старт JSON/SQLite экспорта; polling с остановкой на `done/failed/cancelled`.
  - [x] cancel/download, хранение jobs$ (BehaviorSubject) для UI.
  - [x] Построение URL через `BASE_API_TOKEN` (`svc://songs/dictionaries`); поддержка http для dictionary-client.
  - [ ] При необходимости — новый контроллер в домене `@songs-domain` под обновление справочников (опрашивать/отменять).
  - [x] Очистка poll при destroy/complete.
- [x] Общий UI-компонент нотификаций
  - [x] Перенести `ExportNotificationsComponent` в `libs/ui-lib` (standalone, PrimeNG ProgressBar/Button/Tag/ConfirmPopup).
  - [x] Экспортировать из `libs/ui-lib/src/lib/components/index.ts` и корневого `ui-lib` индекса.
  - [x] Сохранить ConfirmPopup и стили (z-index, pointer-events) без конфликтов.
- [x] Интеграция в `apps/dictionary-client`
  - [x] Заменить локальный `ExportService` на `ExportJobsService`.
  - [x] Подключить общий компонент нотификаций в `app.component`.
  - [x] Обновить кнопки экспорта в songs-table-page для использования общего сервиса.
- [ ] Интеграция в `apps/browser`
  - [x] Использовать новый сервис в `SongDictionariesManager` для запуска загрузок справочников.
  - [x] Вместо отдельной нотификации как в dictionary-client — дополнить карточки справочников прогрессом/статусом обновления при установке/обновлении.
  - [x] Убедиться в корректной работе через `svc://` и воркеры.
- [ ] Проверки
  - [x] Сборка/линт обоих приложений.
  - [x] Ручные сценарии: старт экспорта, отображение прогресса, отмена, скачивание, отсутствие лишних перерисовок карточек.

## Риски/заметки
- Следить за очисткой polling при destroy и при завершённых задачах.
- Конфликт имён/стилей: проверить, что ui-lib CSS не ломает существующие overlay уровни (z-index 1000 сейчас).
