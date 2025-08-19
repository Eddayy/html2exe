module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'server.js',
    'services/**/*.js',
    '!node_modules/**'
  ],
  testMatch: [
    '**/test/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js']
};