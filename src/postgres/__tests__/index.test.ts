import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Define mock pool type
interface MockPool extends pg.Pool {
  getConfig(): { connectionString: string };
}

// Create mock before imports to avoid hoisting issues
jest.mock('pg', () => ({
  Pool: class MockPool {
    private config: { connectionString: string };
    constructor(config: { connectionString: string }) {
      this.config = config;
    }
    end() {
      return Promise.resolve();
    }
    getConfig() {
      return this.config;
    }
  }
}));

import pg from 'pg';

describe('Postgres Server', () => {
  beforeEach(() => {
    // Clear all mocks and modules
    jest.clearAllMocks();
    jest.resetModules();
    
    // Clear environment variables
    delete process.env.CONNECTION_STRING;
    delete process.env.MCP_USER;
    delete process.env.MCP_USER_PASSWORD;
  });

  afterEach(async () => {
    // Clean up after each test
    const { close } = await import('../index.js');
    await close();
  });

  test('initializes with CONNECTION_STRING', async () => {
    // Set up environment
    process.env.CONNECTION_STRING = 'postgresql://user:pass@localhost:5432/db';
    
    // Import and initialize server
    const { initializeServer } = await import('../index.js');
    const { server, pool } = initializeServer() as { server: Server, pool: MockPool };

    // Verify pool configuration
    expect(pool!.getConfig().connectionString).toBe('postgresql://user:pass@localhost:5432/db');
  });

  test('initializes with MCP_USER credentials', async () => {
    // Set up environment
    process.env.MCP_USER = 'test_user';
    process.env.MCP_USER_PASSWORD = 'test_pass';
    
    // Import and initialize server
    const { initializeServer } = await import('../index.js');
    const { pool } = initializeServer() as { server: Server, pool: MockPool };

    // Verify pool configuration with constructed connection string
    expect(pool!.getConfig().connectionString).toBe('postgresql://test_user:test_pass@localhost:5432/postgres');
  });

  test('exits when no credentials provided', async () => {
    // Set up spies
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { initializeServer } = await import('../index.js');

    try {
      initializeServer();
      
      // Verify error handling
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error: Either CONNECTION_STRING or MCP_USER_PASSWORD environment variable is required'
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    } finally {
      // Clean up spies
      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    }
  });
});
