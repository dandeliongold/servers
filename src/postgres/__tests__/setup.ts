import { jest, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';

// Store original environment
const originalEnv = { ...process.env };

export const setup = () => {
  beforeAll(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    // Reset modules to ensure fresh imports
    jest.resetModules();
    
    // Reset environment to clean state
    process.env = { ...originalEnv };
    
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Clear all environment variables that could affect tests
    delete process.env.CONNECTION_STRING;
    delete process.env.MCP_USER;
    delete process.env.MCP_USER_PASSWORD;
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
    
    // Clear all mocks and modules
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });
};

setup();
