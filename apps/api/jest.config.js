/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  testTimeout: 30000,
  globalSetup: '<rootDir>/test/global-setup.ts',
};
