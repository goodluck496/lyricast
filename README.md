# LyriCast

1) скачать и установить [Git](https://git-scm.com/downloads)

2) Скачать и установить [NVM](https://github.com/coreybutler/nvm-windows/releases)
  3) выбрать нужный файл для своей ОС в блоке Assets

## Установить Nodejs 22.19.0 (NVM)

````shell
nvm install 22.19
nvm use 22.19
````

## Установить [PNPM](https://pnpm.io/installation)

````shell
npm install -g pnpm
````

## Установить пакеты

````shell
pnpm install
````

## Установить electron

````shell
pnpm install -D nx-electron
````

## Dev mode

````shell
npm run start
````

## Prod mode

````shell 
npm run build-win
````

## Problems

1) не собирается проект из-за electron:build
2) нужно выполнить ``rebuild`` внутри node_modules/better-sqlite3 - ``nodegyp rebuild``
3) better-sqlite3 - пока удалил, на винде разработка тормозится всякими левыми зависимостями
  - "better-sqlite3": "^11.8.1",
  - "@types/better-sqlite3": "^7.6.12",
4)

------ 
"bible-xml": "https://github.com/Beblia/Holy-Bible-XML-Format"
