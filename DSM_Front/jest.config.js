module.exports = {
  preset: 'react-native',
  clearMocks: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native-config$': '<rootDir>/src/test/mocks/react-native-config.ts',
  },
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  testTimeout: 15000,
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-config|react-native-keychain|react-native-nitro-google-signin|react-native-nitro-modules)/)',
  ],
};
