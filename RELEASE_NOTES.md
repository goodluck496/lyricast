# LyriCast v2.10.0 — Release Notes

### 📖 Переводы Библии и справочники
- **перевод Библии как динамический справочник (LC-10)**:
  - Бэкенд: таблицы PostgreSQL (bibles, bible_books, bible_chapters, bible_verses, bible_meta), контроллер и сервис с пакетной вставкой, ленивой загрузкой структуры/глав/стихов и экспортом
  - MyBible парсер: импорт SQLite модулей через sql.js WASM с каноническим порядком книг
  - dictionary-client: карточки переводов, импорт MyBible/JSON с прогрессом, 3-колоночный вьюер (книги, главы, стихи), редактирование стихов и свойств перевода на PrimeNG
  - LyriCast Browser & Electron: менеджер переводов с процентом загрузки, динамическая установка и удаление, исключение тяжелых переводов из бандла Electron
- Реализована приоритетная вкладка текущей книги, плавающая панель поиска и автозапуск поиска по клавиатуре, чтобы обеспечить быстрый и удобный поиск стихов в Библии

### 🔄 Автообновление (Auto-updater)
- seamless auto-update with background download, menu badge and hover overlay

### 🔐 Авторизация и доступ (Google OAuth 2.0)
- **optimize export, fix oauth callback and auto-select default bible**:
  - Optimize Bible export query in dictionary-api with batch inner joins
  - Increase dictionary download timeout to 180s and support auth headers in BibleByFilesService
  - Support redirect_url, return_path and hash routing in OAuth callback flow
  - Implement ownerEmail access checks and editing for Bible translations
  - Fix NG0955 duplicate track expression warnings in lists
  - Auto-select default Bible translation in BiblePageComponent and SearchFeatureComponent
- integrate google oauth, user_meta, bundle assets and fix bible dialogs (LC-9, LC-10)
- google oauth 2.0 (LC-9) и фиксы оверлеев/свойств Библии (LC-10)

### 🚀 Новые возможности
- add changelog generator script, skill and auto-copy in release command
- Проверена и подтверждена реализация скрытия контролов куплетов и припевов при наведении, чтобы уменьшить визуальный шум интерфейса и обеспечить стабильность тестов

### 📝 Прочие изменения
- add openai api token to gitignore
