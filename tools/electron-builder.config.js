// This will be replaced by CI/CD pipeline
const CI = process.env.CI === 'true';
const GITHUB_TOKEN = process.env.GH_TOKEN || '';
const isPublishEnabled = CI && GITHUB_TOKEN;

module.exports = {
  // npmRebuild: false,
  appId: 'com.lyricast.app',
  productName: 'LyriCast', // Человекочитаемое имя
  executableName: 'lyricast', // Имя бинарника без спецсимволов
  npmRebuild: true,
  files: [
    'dist/apps/browser/**/*',
    'dist/apps/backend/**/*',
    'dist/apps/electron/**',
    'node_modules/**',
    'package.json',
  ],
  win: {
    target: [{ target: 'nsis', arch: ['ia32'] }],
    icon: 'assets/build/icons/lyriicon.ico',
  },
  linux: {
    target: ['AppImage', 'deb', 'rpm'],
    category: 'AudioVideo',
    icon: 'assets/build/icons/lyriicon.ico',
    // packageName: 'lyricast',       // под виндой не собирается если раскомментировать.  имя DEB/RPM пакета (без @ и /)
    artifactName: 'lyricast_${version}_${arch}.${ext}', // куда писать файлы
  },
  asar: true,
  asarUnpack: [
    'resources/backend/**',
    '**/*.node',
    '**/better-sqlite3/**',
    '**/chokidar/**',
  ],
  directories: {
    output: 'dist',
  },
  compression: 'maximum',
  extraResources: [
    // todo  @deprecated
    // { //было нужно для работы старых воркеров внутри electron проекта
    //   from: 'dist/apps/electron/assets',
    //   to: 'electron-assets',
    // },
    {
      from: 'assets/complete-jsons',
      to: 'assets/complete-jsons',
    },
    {
      from: 'assets/build/icons',
      to: 'assets/icons',
    },
    {
      from: 'data',
      to: 'assets/databases',
    },

    // todo самое плохое решение,  но рабочее,
    //  чтобы в вместо битого package.json в backend копировать сразу модули
    // {
    //   from: 'node_modules',
    //   to: 'backend/node_modules',
    // },
  ],
  publish: isPublishEnabled
    ? [
        {
          provider: 'github',
          owner: 'goodluck496', // Замените на ваш GitHub username или организацию
          repo: 'lyricast',
          private: true,
          releaseType: 'draft',
          publishAutoUpdate: true,
        },
      ]
    : null,

  // Настройки для генерации обновлений
  generateUpdatesFilesForAllChannels: true,
  // Указываем, что нужно генерировать файлы обновлений для Windows
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Lyricast',
    // include: 'installer.nsh',
    artifactName: '${productName}-Setup-${version}.${ext}',
  },
  // Настройки для автоматической загрузки релизов на GitHub
  releaseInfo: {
    releaseName: 'v${version}',
    releaseNotes: 'New version ${version}',
  },

  // todo при package electron вырезает зависимости из package.json который копирует в backend,
  //  GPT говорит что чинится так, но не работает
  // extraMetadata: {
  //   dependencies: {
  //     ...require('./package.json').dependencies
  //   },
  // },
};
