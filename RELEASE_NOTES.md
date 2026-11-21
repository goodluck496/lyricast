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
- **Поддержка 3+ мониторов и каналов вывода (LC-8)**:
  - **LC-14**: Ядро многооконности в Electron с реестром `castingWindows: Map<string, BrowserWindow>`, маршрутизацией сообщений Bridge по `targetChannelId` и режимом оконной эмуляции мониторов для разработки (Dev Mode).
  - **LC-15**: Интерфейс настроек экранов и матрица каналов трансляции в PrimeNG (активация, роли, назначение физических дисплеев/эмуляции/OBS/NDI, автостарт, тестирование и закрытие окон).
  - **LC-16**: Мульти-мониторный кастинг: специализированный режим суфлера (Stage Display) на `/stage-display` с крупным контрастным текстом, часами и превью следующего куплета; независимый полноэкранный вывод 2-го перевода Библии на отдельный монитор без сплита 50/50; глобальная экстренная кнопка «Blackout All».
  - **LC-17**: Интеграция с OBS Studio через локальный Browser Source на `/obs/:channelId` с прозрачным фоном и стильным пресетом Lower-Third; сервисная архитектура сетевого видеовещания NDI с автоматическим определением SDK и защитой от падений при отсутствии рантайма.
- add changelog generator script, skill and auto-copy in release command
- Проверена и подтверждена реализация скрытия контролов куплетов и припевов при наведении, чтобы уменьшить визуальный шум интерфейса и обеспечить стабильность тестов

### 🛠 Исправления и оптимизация
- support version strings and auto-resolve previous release range

### 📝 Прочие изменения
- add openai api token to gitignore
