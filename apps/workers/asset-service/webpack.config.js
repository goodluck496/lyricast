const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  mode: 'production',
  devtool: false,
  optimization: {
    minimize: true,
  },
  output: {
    path: join(__dirname, '../../../dist/apps/workers/asset-service'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: true,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
  ],
};
