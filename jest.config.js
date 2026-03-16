export default {
  testEnvironment: 'jsdom',
  transform: {
    '\\.ts$': ['ts-jest', { useESM: true }],
  },
  resolver: './jest.resolver.cjs',
  setupFilesAfterEnv: ['./__tests__/helpers/global-setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['js/**/*.ts', '!js/**/*.d.ts'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
  coveragePathIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['js', 'ts'],
  verbose: false,
  silent: true,
  clearMocks: true,
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: ['/node_modules/'],
};
