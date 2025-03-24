# PostgreSQL

A Model Context Protocol server that provides read-only access to PostgreSQL databases. This server enables LLMs to inspect database schemas and execute read-only queries.

[Previous installation sections remain unchanged...]

## Configuration

The server supports multiple approaches for connecting to PostgreSQL databases:

### 1. Connection String (Simple Setup)

The most straightforward way to connect is by providing a connection string:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "mcp/postgres", 
        "postgresql://localhost:5432/mydb"
      ]
    }
  }
}
```

Note: When running with Docker on macOS, use `host.docker.internal` instead of `localhost`:
```
postgresql://host.docker.internal:5432/mydb
```

### 2. Environment Variables (Recommended)

For better security and configuration management, use environment variables:

```env
# Required
MCP_DB_PASSWORD=your_password

# Optional with defaults
MCP_DB_USER=mcp_user        # default: mcp_user
MCP_DB_HOST=localhost       # default: localhost
MCP_DB_PORT=5432           # default: 5432
MCP_DB_NAME=mydb           # default: postgres

# Connection Pool
MCP_DB_MAX_CONNECTIONS=20   # Max number of clients
MCP_DB_IDLE_TIMEOUT=10000   # Client idle timeout (ms)
MCP_DB_CONNECTION_TIMEOUT=0 # Connection timeout (0 = no timeout)

# SSL Configuration
MCP_DB_SSL_MODE=disable     # disable, require, verify-ca, verify-full
MCP_DB_SSL_CERT=/path/to/cert.pem
MCP_DB_SSL_KEY=/path/to/key.pem
MCP_DB_SSL_ROOT_CERT=/path/to/ca.pem
MCP_DB_SSL_PASSPHRASE=secret
MCP_DB_SSL_REJECT_UNAUTHORIZED=true

# Application Name (for monitoring)
MCP_DB_APPLICATION_NAME=my-app
```

Example configuration:
```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--env-file",
        "/path/to/.env",
        "mcp/postgres"
      ]
    }
  }
}
```

### Common Scenarios

#### 1. Local Development
```env
MCP_DB_PASSWORD=dev_password
MCP_DB_SSL_MODE=disable
```

#### 2. AWS RDS
```env
MCP_DB_HOST=your-db.region.rds.amazonaws.com
MCP_DB_SSL_MODE=verify-full
MCP_DB_SSL_ROOT_CERT=/path/to/rds-combined-ca-bundle.pem
```

#### 3. Docker Compose
```env
MCP_DB_HOST=host.docker.internal
MCP_DB_PASSWORD=your_password
```

### Multiple Database Support

You can connect to multiple databases by using different names:

```json
{
  "mcpServers": {
    "postgres-dev": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--env-file",
        "/path/to/dev.env",
        "mcp/postgres",
        "--db-name",
        "dev"
      ]
    },
    "postgres-prod": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--env-file",
        "/path/to/prod.env",
        "mcp/postgres",
        "--db-name",
        "prod"
      ]
    }
  }
}
```

Each database connection:
- Has its own set of credentials in a separate .env file
- Gets a unique prefix for its tools (e.g., `dev.query`, `prod.query`)
- Shows its database name in resource listings and query results

### Legacy Support

For backwards compatibility, you can still provide credentials in the connection string:
```
postgresql://user:password@host:5432/dbname
```

However, this approach is discouraged as it:
- Stores credentials in configuration files
- Makes it harder to manage different environments
- May encourage using superuser accounts

## Components

### Tools

Tools are prefixed with the database name when multiple connections are configured:

- **[dbname.]query**
  - Execute read-only SQL queries against the specified database
  - Input: `sql` (string): The SQL query to execute
  - All queries are executed within a READ ONLY transaction
  - Response includes the database name and timestamp

### Resources

The server provides schema information for each table in the database:

- **Table Schemas** (`postgres://<dbname.><host>/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from database metadata
  - Response includes the database name and timestamp

[Previous troubleshooting sections remain unchanged...]

## Building

Docker:

```sh
docker build -t mcp/postgres -f src/postgres/Dockerfile . 
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
