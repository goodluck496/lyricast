module.exports = {
  dir: 'apps/electron',
  packagerConfig: {
    name: 'LyriCast',
    asar: true,
    osxSign: {},
    appCategoryType: 'public.church-category',
  },
  rebuildConfig: {
    force: true,
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platform: ['darwin'],
    },
  ],
};
