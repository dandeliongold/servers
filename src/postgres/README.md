# PostgreSQL

A Model Context Protocol server that provides read-only access to PostgreSQL databases. This server enables LLMs to inspect database schemas and execute read-only queries.

## Prerequisites

### Installing PostgreSQL

#### Windows
1. Download the installer from [PostgreSQL Downloads](https://www.postgresql.org/download/windows/)
2. Run the installer and follow the setup wizard:
   - Choose installation directory
   - Select components (all recommended)
   - Set password for database superuser (postgres)
   - Set port (default: 5432)
   - Choose locale

3. Add PostgreSQL to your PATH:
   - Automatic (during installation):
     * Make sure to check "Add PostgreSQL to the PATH" during installation
   - Manual (after installation):
     * First, find your PostgreSQL installation path:
       ```powershell
       Get-ChildItem 'C:\Program Files\PostgreSQL' -ErrorAction SilentlyContinue
       ```
       This will show your PostgreSQL version folder (e.g., "17")
     * Right-click on Start → System
     * Click "Advanced system settings"
     * Click "Environment Variables" button at the bottom
     * Under "System Variables", find and select "Path"
     * Click "Edit" and add your path, eg: `C:\Program Files\PostgreSQL\17\bin`
     * Click "OK" on all windows
     * Restart any open Command Prompt/PowerShell windows for this to take effect.

How to interact directly with PostgreSQL on Windows:
- Use Command Prompt/PowerShell with `psql`
- Admin UI is called pgAdmin (included in installation)

#### macOS
Using Homebrew:
```bash
brew install postgresql@17
brew services start postgresql@17
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Verifying Installation

1. Check PostgreSQL service status:
   - Windows:
     * Using PowerShell (recommended): `powershell -Command "Get-Service postgresql* | Select-Object Name, Status"`
     * Using UI: Open Services (Win + R, type `services.msc`) and look for "postgresql"
   - macOS: `brew services list`
   - Linux: `sudo systemctl status postgresql`

2. Start the service if its not already running:
    - Windows:
      * Using PowerShell (recommended): `Start-Service postgresql-x64-17`
      * Using UI: Use step above to find in Services and right click to select Start.
      * You can set the service to start automatically with Windows either through the Services UI (right click, select Properties, and change Startup Type) or by running `Set-Service postgresql-x64-17 -StartupType Automatic`

3. Test connection to PostgreSQL using connection string (replace `your_password` with your postgres user password):
```bash
psql "postgresql://postgres:your_password@localhost:5432" -c "SELECT version();"
```

### Creating a Test Database

1. Create test database using connection string (replace `your_password` with your postgres user password):
```bash
# Create database
psql "postgresql://postgres:your_password@localhost:5432" -c "CREATE DATABASE testdb;"

# Create test table and insert data
psql "postgresql://postgres:your_password@localhost:5432/testdb" -c "CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT); INSERT INTO test (name) VALUES ('test data');"

# Verify data
psql "postgresql://postgres:your_password@localhost:5432/testdb" -c "SELECT * FROM test;"
```

2. Create a dedicated user for MCP server (replace `your_password` with postgres superuser password):
```bash
# Create read-only user and grant database access
psql "postgresql://postgres:your_password@localhost:5432" -c "CREATE USER mcp_user WITH PASSWORD 'mcp_password'; GRANT CONNECT ON DATABASE testdb TO mcp_user;"

# Grant schema permissions (run this on the testdb database)
psql "postgresql://postgres:your_password@localhost:5432/testdb" -c "GRANT USAGE ON SCHEMA public TO mcp_user; GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_user; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mcp_user;"
```

3. Test the read-only user:
```bash
# Test SELECT permission (should work)
psql "postgresql://mcp_user:mcp_password@localhost:5432/testdb" -c "SELECT * FROM test;"

# Test INSERT permission (should fail with "permission denied")
psql "postgresql://mcp_user:mcp_password@localhost:5432/testdb" -c "INSERT INTO test (name) VALUES ('test');"
```

4. Connection string for MCP server (using the read-only user):
```
postgresql://mcp_user:mcp_password@localhost:5432/testdb
```

Note: 
- Using the connection string approach avoids interactive password prompts and is more suitable for scripting and automation
- Using a dedicated read-only user follows security best practices and the principle of least privilege

### Troubleshooting

1. Connection refused:
   - Check PostgreSQL service status: see [Verifying Installation](#verifying-installation)
   - Verify port availability:
     * Windows: `netstat -ano | findstr :5432`
     * macOS/Linux: `lsof -i :5432`
   - Check connection permissions in pg_hba.conf:
     * Windows: `%PROGRAMFILES%\PostgreSQL\[version]\data\pg_hba.conf`
     * macOS: `/opt/homebrew/var/postgresql@17/pg_hba.conf`
     * Linux: `/etc/postgresql/[version]/main/pg_hba.conf`
     * Add/modify line: `host all all 127.0.0.1/32 scram-sha-256`

2. Authentication failed
   - Test connection with connection string:
     ```bash
     # List databases
     psql "postgresql://postgres:your_password@localhost:5432" -c "\l"
     ```
   - Reset postgres user password:
     * Windows:
       ```bash
       # Change password using connection string
       psql "postgresql://postgres:your_password@localhost:5432" -c "ALTER USER postgres WITH PASSWORD 'new_password';"
       ```
     * Linux:
       ```bash
       sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'new_password';"
       ```

3. Port conflicts
   - Find process using port 5432:
     * Windows: `netstat -ano | findstr :5432`
     * macOS/Linux: `lsof -i :5432`
   - Change PostgreSQL port:
     1. Edit postgresql.conf:
        * Windows: `%PROGRAMFILES%\PostgreSQL\[version]\data\postgresql.conf`
        * macOS: `/opt/homebrew/var/postgresql@17/postgresql.conf`
        * Linux: `/etc/postgresql/[version]/main/postgresql.conf`
     2. Modify line: `port = 5433` (or another available port)
     3. Restart PostgreSQL service
     4. Update connection string to use new port

## Components

### Tools

- **query**
  - Execute read-only SQL queries against the connected database
  - Input: `sql` (string): The SQL query to execute
  - All queries are executed within a READ ONLY transaction

### Resources

The server provides schema information for each table in the database:

- **Table Schemas** (`postgres://<host>/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from database metadata

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on macos, use host.docker.internal if the server is running on the host network (eg localhost)
* username/password can be added to the postgresql url with `postgresql://user:password@host:port/db-name`

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
        "postgresql://mcp_user:mcp_password@host.docker.internal:5432/testdb"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://mcp_user:mcp_password@localhost:5432/testdb"
      ]
    }
  }
}
```

Replace the connection string with your read-only user credentials and database name.

## Building

Docker:

```sh
docker build -t mcp/postgres -f src/postgres/Dockerfile . 
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
