// Jest setup file
process.env.NODE_ENV = 'test';

// Suppress console.log during tests unless testing specific logging
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  // Keep console.error for meaningful test failures, but silence expected errors
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});