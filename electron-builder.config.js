module.exports = {
  npmRebuild: false,
  files: [
    'dist/apps/browser/**/*',
    'dist/apps/backend/**/*',
    'dist/apps/electron/**/*',
    '!package.json',
    // 'node_modules',
    // 'package.json',
  ],
  asar: true,
  asarUnpack: ["resources/backend/**"],
  directories: {
    output: 'dist',
  },
  compression: 'maximum',
  extraResources: [
    {
      from: 'dist/apps/backend',
      to: 'backend',
    },
    // todo самое плохое решение,  но рабочее, чтобы в вместо битого package.json в backend копировать сразу модули
    // {
    //   from: 'node_modules',
    //   to: 'backend/node_modules',
    // },
  ],
  // todo при package electron вырезает зависимости из package.json который копирует в backend,
  //  GPT говорит что чинится так, но не работает
  // extraMetadata: {
  //   dependencies: {
  //     ...require('./package.json').dependencies
  //   },
  // },
};
