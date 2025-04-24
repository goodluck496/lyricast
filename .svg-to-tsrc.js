const svgToTsConfig = {
  srcFiles: ['./libs/svg-icons/src/icons/**/*.svg'],
  outputDirectory: './libs/svg-icons/src/',
  interfaceName: 'LyriIcon',
  typeName: 'LyriIconName',
  generateType: true,
  modelFileName: 'lyri-svg-icon.model',
  iconsFolderName: 'lyri-icons',
  delimiter: 'SNAKE',
  barrelFileName: 'lyri-icons',
  svgoConfig: {
    plugins: ['cleanupAttrs'],
  },
  prefix: 'lyri',
  compileSources: false,
  conversionType: 'files',
};

module.exports = svgToTsConfig;
