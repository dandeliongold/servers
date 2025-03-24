import { jest, describe, test, expect, afterEach } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setup } from './setup.js';

// Set up test environment
setup();

// Define mock pool type
interface MockPool extends pg.Pool {
  getConfig(): any;
}

// Create mock before imports to avoid hoisting issues
jest.mock('pg', () => ({
  Pool: class MockPool {
    private config: any;
    constructor(config: { connectionString?: string } | pg.PoolConfig) {
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

  afterEach(async () => {
    // Clean up after each test
    const { close } = await import('../index.js');
    await close();
  });

  test('initializes with command line connection string', async () => {
    // Add connection string to argv
    process.argv.push('postgresql://user:pass@localhost:5432/mydb');
    
    // Import and initialize server
    const { initializeServer } = await import('../index.js');
    const { pool } = initializeServer() as { server: Server, pool: MockPool };

    // Verify pool configuration
    expect(pool!.getConfig().connectionString).toBe('postgresql://user:pass@localhost:5432/mydb');
  });

  test('initializes with basic env vars', async () => {
    // Set up environment
    process.env.MCP_DB_USER = 'test_user';
    process.env.MCP_DB_PASSWORD = 'test_pass';
    process.env.MCP_DB_HOST = 'test.host';
    process.env.MCP_DB_PORT = '5433';
    process.env.MCP_DB_NAME = 'testdb';
    
    // Import and initialize server
    const { initializeServer } = await import('../index.js');
    const { pool } = initializeServer() as { server: Server, pool: MockPool };

    // Verify pool configuration
    const config = pool!.getConfig();
    expect(config.user).toBe('test_user');
    expect(config.password).toBe('test_pass');
    expect(config.host).toBe('test.host');
    expect(config.port).toBe(5433);
    expect(config.database).toBe('testdb');
  });

  test('initializes with SSL config', async () => {
    // Set up environment
    process.env.MCP_DB_PASSWORD = 'test_pass';
    process.env.MCP_DB_SSL_MODE = 'verify-full';
    process.env.MCP_DB_SSL_CERT = '/path/to/cert.pem';
    process.env.MCP_DB_SSL_KEY = '/path/to/key.pem';
    process.env.MCP_DB_SSL_ROOT_CERT = '/path/to/ca.pem';
    process.env.MCP_DB_SSL_PASSPHRASE = 'secret';
    process.env.MCP_DB_SSL_REJECT_UNAUTHORIZED = 'true';
    
    // Import and initialize server
    const { initializeServer } = await import('../index.js');
    const { pool } = initializeServer() as { server: Server, pool: MockPool };

    // Verify pool configuration
    const config = pool!.getConfig();
    expect(config.ssl).toEqual({
      sslmode: 'verify-full',
      sslcert: '/path/to/cert.pem',
      sslkey: '/path/to/key.pem',
      sslca: '/path/to/ca.pem',
      passphrase: 'secret',
      rejectUnauthorized: true
    });
  });

  test('initializes with connection pool config', async () => {
    // Set up environment
    process.env.MCP_DB_PASSWORD = 'test_pass';
    process.env.MCP_DB_MAX_CONNECTIONS = '20';
    process.env.MCP_DB_IDLE_TIMEOUT = '10000';
    process.env.MCP_DB_CONNECTION_TIMEOUT = '5000';
    process.env.MCP_DB_APPLICATION_NAME = 'test-app';
    
    // Import and initialize server
    const { initializeServer } = await import('../index.js');
    const { pool } = initializeServer() as { server: Server, pool: MockPool };

    // Verify pool configuration
    const config = pool!.getConfig();
    expect(config.max).toBe(20);
    expect(config.idleTimeoutMillis).toBe(10000);
    expect(config.connectionTimeoutMillis).toBe(5000);
    expect(config.application_name).toBe('test-app');
  });

  test('initializes with database name argument', async () => {
    // Set up environment and args
    process.env.MCP_DB_PASSWORD = 'test_pass';
    process.argv.push('--db-name', 'test');
    
    // Import and initialize server
    const { initializeServer } = await import('../index.js');
    const { pool } = initializeServer() as { server: Server, pool: MockPool };

    // Verify pool configuration
    const config = pool!.getConfig();
    expect(config.database).toBe('test');
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
        'Error: MCP_DB_PASSWORD environment variable is required when not using connection string'
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    } finally {
      // Clean up spies
      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    }
  });
});
