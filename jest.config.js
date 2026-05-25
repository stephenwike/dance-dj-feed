/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  transform: {},           // no transform — tests use CommonJS mocks
  moduleNameMapper: {
    // Map ESM imports from the API routes to CJS-compatible stubs in tests
    '^../../../lib/server/mongodb$': '<rootDir>/__tests__/__mocks__/mongodb.js',
    '^../../../../lib/server/mongodb$': '<rootDir>/__tests__/__mocks__/mongodb.js',
  },
};
