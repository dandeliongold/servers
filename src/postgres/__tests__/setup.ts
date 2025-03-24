import { jest, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';

// Store original states
const originalEnv = { ...process.env };
const originalArgv = [...process.argv];

export const setup = () => {
  beforeAll(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    // Reset modules to ensure fresh imports
    jest.resetModules();
    
    // Reset environment and argv to clean state
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
    
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Clear all environment variables that could affect tests
    delete process.env.CONNECTION_STRING;
    delete process.env.MCP_USER;
    delete process.env.MCP_USER_PASSWORD;
    delete process.env.MCP_DB_USER;
    delete process.env.MCP_DB_PASSWORD;
    delete process.env.MCP_DB_HOST;
    delete process.env.MCP_DB_PORT;
    delete process.env.MCP_DB_NAME;
    delete process.env.MCP_DB_SSL_MODE;
    delete process.env.MCP_DB_SSL_CERT;
    delete process.env.MCP_DB_SSL_KEY;
    delete process.env.MCP_DB_SSL_ROOT_CERT;
    delete process.env.MCP_DB_SSL_PASSPHRASE;
    delete process.env.MCP_DB_SSL_REJECT_UNAUTHORIZED;
    delete process.env.MCP_DB_MAX_CONNECTIONS;
    delete process.env.MCP_DB_IDLE_TIMEOUT;
    delete process.env.MCP_DB_CONNECTION_TIMEOUT;
    delete process.env.MCP_DB_APPLICATION_NAME;
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment and argv
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
    
    // Clear all mocks and modules
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });
};

setup();
