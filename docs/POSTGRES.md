# Postgres Language Server

A guide showing how to configure [Symbols MCP](https://github.com/p1va/symbols) to run [postgres-language-server](https://github.com/supabase-community/postgres-language-server) and enable coding agents to autocomplete, inspect and diagnose SQL files based on schema.

## Installation

<details>
<summary>
  &nbsp;
  ⚙️
  &nbsp;
  <b>Install Postgres Language Server</b>
</summary>

### Install Postgres Language Server

The CLI ships as a native binary via platform-specific npm packages. It must be installed locally (not via `npx` alone, as `npx` doesn't reliably install the platform-specific optional dependencies).

```bash
npm install -D "@postgres-language-server/cli"
```

### Configuration

For the language server to offer more than just syntax validation it has to have knowledge of the schema either via an export or a database connection. This can be done with a config file to be initialized with:

```bash
npx postgres-language-server init
```

This creates `postgres-language-server.jsonc` with defaults.

Edit this by updating the `db` section with your PostgreSQL connection details:

```jsonc
{
  "db": {
    "host": "your-db-host.com",
    "port": 5432,
    "username": "postgres",
    "password": "your-password",
    "database": "postgres",
    "connTimeoutSecs": 10,
    "disableConnection": false,
  },
}
```

</details>

<details>
<summary>
  &nbsp;
  ⚙️
  &nbsp;
  <b>Add MCP Server</b>
</summary>

### Add MCP Server

After configuring the Language Server add it to a coding agent using Symbols MCP which will act as a bridge between them.

Assuming a Claude Code-style configuration add this to `.mcp.json`:

```json
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y",
        "@p1va/symbols@latest",
        "run",
        "npx",
        "postgres-language-server",
        "lsp-proxy"
      ]
    }
  }
}
```

</details>

## Examples

### `completion`

Use this tool to discover available schema

<details>
<summary>
  &nbsp;
  ⚒️
  &nbsp;
  <b>Find available tables after </b><code>FROM</code>
</summary>

#### Find available tables after `FROM`

An agent that needs to query data but doesn't know what tables exist can use completion after `FROM` to discover them.

**Input**: `SELECT * FROM |;` (cursor at position after `FROM `)

**Tool Response**

```
Completion on test.sql:3:15
    Snippet: `...CT * FROM |;`

Found 50 completion suggestions

Namespaces (2)
  _crypto_aead_det_decrypt
  _crypto_aead_det_encrypt

Propertys (48)
  photobooks
  auth
  extensions
  graphql
  graphql_public
  pgbouncer
  realtime
  storage
  vault
  audit_log_entries
  buckets
  ...
```

The agent now knows the database has a `photobooks` table in the `public` schema, along with tables in `auth`, `storage`, `vault`, and other schemas.

</details>

<details>
<summary>
  &nbsp;
  ⚒️
  &nbsp;
  <b>Find available columns in </b><code>SELECT</code>
</summary>

#### Find available columns in `SELECT`

An agent that knows the table but not its columns can use completion between `SELECT` and `FROM` to discover available columns.

**Input**: `SELECT | FROM photobooks WHERE ;` (cursor at position after `SELECT `)

**Tool Response**:

```
Completion on test.sql:1:8
    Snippet: `SELECT | FROM phot...`

Found 50 completion suggestions

Classs (50)
  author
  created_at
  id
  title
  aaguid
  aal
  acceptable_client_ids
  ...
```

The first 4 results (`author`, `created_at`, `id`, `title`) are the columns of the `photobooks` table. The agent can now write a precise `SELECT` statement.

</details>

<details>
<summary>
  &nbsp;
  ⚒️
  &nbsp;
  <b>Find available columns in </b><code>WHERE</code>
</summary>

#### Find available columns in `WHERE`

An agent building a filter clause can use completion after `WHERE` to see which columns are available for filtering.

**Input**: `SELECT  FROM photobooks WHERE |;` (cursor at position after `WHERE `)

**Tool Response**:

```
Completion on test.sql:1:31
    Snippet: `...oks WHERE |;`

Found 50 completion suggestions

Classs (50)
  author
  created_at
  id
  title
  ...
```

The agent sees the same column list and can construct a valid `WHERE` clause, e.g., `WHERE author = 'John'`.

</details>

### `inspect`

Use this tool to get full table schemas

<details>
<summary>
  &nbsp;
  ⚒️
  &nbsp;
  <b>Get table metadata and column types</b>
</summary>

#### Get table metadata and column types

An agent can hover over a table name to get detailed schema information including column types, nullability, row counts, and comments.

**Input**: Inspect on `photobooks` in `SELECT FROM photobooks WHERE ;`

**Tool Response**:

```
Inspect on test.sql:1:15
    Snippet: `...CT  FROM p|hotobooks ...`

Documentation
### `public.photobooks` - 🔒 RLS enabled
  Comment: 'Photobooks in collection'
  Columns:
  - id: int8 - not null
  - created_at: timestamptz - not null
  - author: varchar - nullable
  - title: varchar - nullable

  ~91 rows, ~0 dead rows, 32.77 kB
```

The agent now knows:

- The table has RLS enabled
- Column types and nullability (e.g., `id` is `int8 not null`, `author` is `varchar nullable`)
- The table contains ~91 rows
- The table's purpose from its comment: "Photobooks in collection"

This is enough for the agent to write type-safe queries and understand the data model.

</details>

### `diagnostics`

Use this tool to validate SQL syntax

<details>
<summary>
  &nbsp;
  ⚒️
  &nbsp;
  <b>Catch syntax errors in SQL</b>
</summary>

#### Catch syntax errors in SQL

An agent can use diagnostics to validate SQL after writing it, catching syntax errors before execution.

**Input**: A file containing invalid SQL:

```sql
SELEC broken query here;

INSERT INTO photobooks (id, name VALUES (1, 'test');
```

**Tool Response**:

```
✘ @1:1 [Error][syntax] Invalid statement: syntax error at or near "SELEC" (pg)
✘ @3:1 [Error][syntax] Invalid statement: syntax error at or near "VALUES" (pg)
```

The agent sees two errors:

- Line 1: `SELEC` is not a valid keyword (should be `SELECT`)
- Line 3: missing `)` before `VALUES` in the `INSERT` statement

After fixing the SQL:

```sql
SELECT id, title, author FROM photobooks WHERE id = 1;
```

**Tool Response**:

```
No diagnostics found for this file.
```

The agent can now confirm the query is syntactically valid before executing it.

</details>
