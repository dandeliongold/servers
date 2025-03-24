#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";
import dotenv from "dotenv";

export let server: Server | undefined;
export let pool: pg.Pool | undefined;

export function initializeServer() {
  interface Arguments {
    'env-file'?: string;
    'db-name': string;
    _: (string | number)[];
  }

  // Check for env file argument
  const envFileArg = process.argv.indexOf('--env-file');
  if (envFileArg !== -1) {
    const envFile = process.argv[envFileArg + 1];
    const result = dotenv.config({ path: envFile });
    if (result.error) {
      console.error(`Error loading .env file: ${result.error.message}`);
      process.exit(1);
    }
  }

  // Get database name from command line args if provided
  const dbNameArg = process.argv.indexOf('--db-name');
  const dbName = dbNameArg !== -1 ? process.argv[dbNameArg + 1] : 'default';
  const namePrefix = dbName === 'default' ? '' : `${dbName}.`;

  server = new Server(
    {
      name: "example-servers/postgres",
      version: "0.6.2",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Initialize pool configuration
  const poolConfig: pg.PoolConfig = {};

  // Check for connection string (last argument that's not a flag or flag value)
  const connectionArg = process.argv[process.argv.length - 1];
  const isConnectionString = connectionArg && !connectionArg.startsWith('-') && 
    process.argv[process.argv.length - 2] !== '--db-name';

  if (isConnectionString) {
    poolConfig.connectionString = connectionArg;
  } else {
    // Basic connection settings
    poolConfig.user = process.env.MCP_DB_USER || 'mcp_user';
    poolConfig.password = process.env.MCP_DB_PASSWORD;
    poolConfig.host = process.env.MCP_DB_HOST || 'localhost';
    poolConfig.port = process.env.MCP_DB_PORT ? parseInt(process.env.MCP_DB_PORT) : 5432;
    poolConfig.database = process.env.MCP_DB_NAME || (dbName === 'default' ? 'postgres' : dbName);

    if (!poolConfig.password) {
      console.error("Error: MCP_DB_PASSWORD environment variable is required when not using connection string");
      process.exit(1);
    }

    // Pool configuration
    if (process.env.MCP_DB_MAX_CONNECTIONS) {
      poolConfig.max = parseInt(process.env.MCP_DB_MAX_CONNECTIONS);
    }
    if (process.env.MCP_DB_IDLE_TIMEOUT) {
      poolConfig.idleTimeoutMillis = parseInt(process.env.MCP_DB_IDLE_TIMEOUT);
    }
    if (process.env.MCP_DB_CONNECTION_TIMEOUT) {
      poolConfig.connectionTimeoutMillis = parseInt(process.env.MCP_DB_CONNECTION_TIMEOUT);
    }
    if (process.env.MCP_DB_APPLICATION_NAME) {
      poolConfig.application_name = process.env.MCP_DB_APPLICATION_NAME;
    }

    // SSL configuration
    if (process.env.MCP_DB_SSL_MODE) {
      poolConfig.ssl = {
        sslmode: process.env.MCP_DB_SSL_MODE,
        sslcert: process.env.MCP_DB_SSL_CERT,
        sslkey: process.env.MCP_DB_SSL_KEY,
        sslca: process.env.MCP_DB_SSL_ROOT_CERT,
        passphrase: process.env.MCP_DB_SSL_PASSPHRASE,
        rejectUnauthorized: process.env.MCP_DB_SSL_REJECT_UNAUTHORIZED === 'true'
      } as any; // Type assertion needed for pg-specific SSL properties
    }
  }

  // Create the pool first to validate configuration
  pool = new pg.Pool(poolConfig);

  // Initialize resourceBaseUrl for use in handlers
  let resourceBaseUrl: URL;
  try {
    if (connectionArg) {
      // For connection string, ensure it has the correct protocol
      const urlStr = connectionArg.startsWith('postgresql://') 
        ? connectionArg 
        : `postgresql://${connectionArg.replace(/^postgres(ql)?:\/\//, '')}`;
      resourceBaseUrl = new URL(urlStr);
    } else {
      // Build URL from the pool configuration
      const user = poolConfig.user || '';
      const password = typeof poolConfig.password === 'function' 
        ? poolConfig.password() 
        : (poolConfig.password || '');
      const userInfo = `${encodeURIComponent(user)}:${encodeURIComponent(String(password))}`;
      const url = `postgresql://${userInfo}@${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`;
      resourceBaseUrl = new URL(url);
    }
  } catch (error: any) {
    // If URL construction fails, try a more lenient approach for connection string
    if (connectionArg) {
      try {
        const [credentials, hostPart] = connectionArg.split('@');
        const [user, pass] = credentials.replace(/^postgres(ql)?:\/\//, '').split(':');
        const [host, database] = hostPart.split('/');
        resourceBaseUrl = new URL(`postgresql://${user}:${pass}@${host}/${database}`);
      } catch (e) {
        throw new Error(`Invalid connection string format: ${error.message}`);
      }
    } else {
      throw error;
    }
  }

  // Standardize protocol and clear sensitive info
  resourceBaseUrl.protocol = "postgres:";
  resourceBaseUrl.password = "";
  
  // Add database name to hostname if specified
  if (dbName !== 'default') {
    resourceBaseUrl.hostname = `${dbName}.${resourceBaseUrl.hostname}`;
  }

  const SCHEMA_PATH = "schema";

  // Set up request handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const client = await pool!.connect();
    try {
      const result = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      return {
        resources: result.rows.map((row) => ({
          uri: new URL(`${row.table_name}/${SCHEMA_PATH}`, resourceBaseUrl).href,
          mimeType: "application/json",
          name: `"${row.table_name}" database schema (${dbName})`,
        })),
      };
    } finally {
      client.release();
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      // Validate and parse resource URI
      let resourceUrl: URL;
      try {
        resourceUrl = new URL(request.params.uri);
        if (resourceUrl.protocol !== 'postgres:') {
          throw new Error('Invalid protocol - must be postgres://');
        }
      } catch (error: any) {
        throw new Error(`Invalid resource URI format: ${error?.message || 'Invalid URI'}`);
      }

      // Extract and validate path components
      const pathComponents = resourceUrl.pathname.split("/").filter(Boolean);
      if (pathComponents.length !== 2) {
        throw new Error('Invalid resource path - expected format: table_name/schema');
      }

      const [tableName, schema] = pathComponents;
      if (!tableName) {
        throw new Error('Table name is required');
      }
      if (schema !== SCHEMA_PATH) {
        throw new Error(`Invalid schema path - expected '${SCHEMA_PATH}'`);
      }

      // Connect to database with timeout
      const client = await Promise.race([
        pool!.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), 5000)
        )
      ]) as pg.PoolClient;

      try {
        // First check if table exists
        const tableCheck = await client.query(
          "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)",
          [tableName]
        );

        if (!tableCheck.rows[0].exists) {
          throw new Error(`Table '${tableName}' not found`);
        }

        // Get column information
        const result = await client.query(
          "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1",
          [tableName]
        );

        if (result.rows.length === 0) {
          throw new Error(`No columns found for table '${tableName}'`);
        }

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify({
                table: tableName,
                database: dbName,
                columns: result.rows,
                timestamp: new Date().toISOString()
              }, null, 2),
            },
          ],
        };
      } finally {
        client.release();
      }
    } catch (error: any) {
      // Convert all errors to a standardized format
      const errorMessage = error?.message || 'Unknown error occurred';
      const errorCode = error?.code || 'UNKNOWN_ERROR';
      
      throw new Error(JSON.stringify({
        error: errorMessage,
        code: errorCode,
        timestamp: new Date().toISOString()
      }));
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: `${namePrefix}query`,
          description: `Run a read-only SQL query on the ${dbName} database`,
          inputSchema: {
            type: "object",
            properties: {
              sql: { type: "string" },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const expectedToolName = `${namePrefix}query`;
    if (request.params.name === expectedToolName) {
      const sql = request.params.arguments?.sql as string;

      const client = await pool!.connect();
      try {
        await client.query("BEGIN TRANSACTION READ ONLY");
        const result = await client.query(sql);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              database: dbName,
              rows: result.rows,
              timestamp: new Date().toISOString()
            }, null, 2) 
          }],
          isError: false,
        };
      } catch (error) {
        throw error;
      } finally {
        client
          .query("ROLLBACK")
          .catch((error) =>
            console.warn("Could not roll back transaction:", error)
          );

        client.release();
      }
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return { server, pool };
}

export async function close() {
  if (pool) await pool.end();
  if (server) await server.close();
}

// Only run server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  const { server } = initializeServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
