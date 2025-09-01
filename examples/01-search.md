# Search Tool Example

The `search` tool allows you to quickly find symbols across your entire codebase by name or pattern.

## Example: Finding a Function

**Query:** `createServer`

**Command:**
```
mcp__symbols__search({ query: "createServer" })
```

**Output:**
```
Found 1 matches for query "createServer" across 1 files

src/main/createServer.ts (1 results)
  @8:1 Function - createServer
    `export function createServer(createContext: () => LspContext): McpServer { const server = new...`
```

## Key Benefits

- **Instant Symbol Discovery**: Find functions, classes, interfaces by name across the entire workspace
- **Type-Aware**: Shows symbol types (Function, Class, Interface, etc.)
- **Location Context**: Precise file paths and line numbers for navigation
- **Code Preview**: Brief snippet showing the symbol declaration
- **Multi-file Results**: Searches across all files in the workspace simultaneously

## Use Cases

- Finding where a specific function is defined
- Locating all classes with a certain name pattern
- Discovering available APIs in a large codebase
- Quick navigation to symbol definitions
- Code exploration and discovery