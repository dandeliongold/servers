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

export let server: Server | undefined;
export let pool: pg.Pool | undefined;

export function initializeServer() {
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
    },
  );

  // Check for connection configuration
  const CONNECTION_STRING = process.env.CONNECTION_STRING;
  const MCP_USER = process.env.MCP_USER || 'mcp_user';
  const MCP_USER_PASSWORD = process.env.MCP_USER_PASSWORD;

  if (!CONNECTION_STRING && !MCP_USER_PASSWORD) {
    console.error("Error: Either CONNECTION_STRING or MCP_USER_PASSWORD environment variable is required");
    process.exit(1);
  }

  // Use provided connection string or construct one with configured user
  const databaseUrl = CONNECTION_STRING || `postgresql://${MCP_USER}:${MCP_USER_PASSWORD}@localhost:5432/postgres`;

  // Initialize resourceBaseUrl for use in handlers
  const resourceBaseUrl = new URL(databaseUrl);
  resourceBaseUrl.protocol = "postgres:";
  resourceBaseUrl.password = "";

  pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  const SCHEMA_PATH = "schema";

  // Set up request handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const client = await pool!.connect();
    try {
      const result = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      );
      return {
        resources: result.rows.map((row) => ({
          uri: new URL(`${row.table_name}/${SCHEMA_PATH}`, resourceBaseUrl).href,
          mimeType: "application/json",
          name: `"${row.table_name}" database schema`,
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
          name: "query",
          description: "Run a read-only SQL query",
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
    if (request.params.name === "query") {
      const sql = request.params.arguments?.sql as string;

      const client = await pool!.connect();
      try {
        await client.query("BEGIN TRANSACTION READ ONLY");
        const result = await client.query(sql);
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
          isError: false,
        };
      } catch (error) {
        throw error;
      } finally {
        client
          .query("ROLLBACK")
          .catch((error) =>
            console.warn("Could not roll back transaction:", error),
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
