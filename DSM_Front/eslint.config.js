const { FlatCompat } = require('@eslint/eslintrc');
const path = require('path');

const reactNativeConfigDirectory = path.dirname(
  require.resolve('@react-native/eslint-config/package.json'),
);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: reactNativeConfigDirectory,
});

module.exports = [
  { ignores: ['android/**', 'coverage/**', 'node_modules/**'] },
  ...compat.extends('@react-native'),
];
