# References Tool Example

The `references` tool finds all usages of a symbol across your entire codebase, making it essential for refactoring, understanding code impact, and tracking dependencies.

## Example: Finding All References to createServer Function

**Target:** The `createServer` function in our codebase

**Command:**
```
mcp__symbols__references({ 
  file: "src/main/createServer.ts", 
  line: 8, 
  character: 18 
})
```

**Output:**
```
References on src/main/createServer.ts:8:18
    Cursor: `...function c|reateServe...`
    Target: (function) createServer [declaration]
    Symbol: (Function) createServer

Found 3 reference(s) across 2 files

src/main/createServer.ts (1 references)
  @8:17 createServer
    `export function createServer(createContext: () => LspContext): McpServer {`

src/main/index.ts (2 references)
  @38:10 createServer
    `import { createServer } from './createServer.js';`
  @292:18 createServer
    `const server = createServer(createContext);`
```

## Key Benefits

- **Complete Usage Analysis**: Find every place a symbol is used across the entire codebase
- **Cross-File Tracking**: Discover usages in imports, function calls, and references across multiple files
- **Precise Location Context**: Get exact line numbers and code snippets for each reference
- **Impact Assessment**: Understand the scope of changes before refactoring
- **Dependency Mapping**: See how symbols flow through your codebase

## Reference Types Shown

1. **Declaration**: The original definition (`@8:17` in createServer.ts)
2. **Import**: Where the symbol is imported (`@38:10` in index.ts) 
3. **Usage**: Where the symbol is actually called (`@292:18` in index.ts)

## Use Cases

- **Safe Refactoring**: Know all places that need updating before changing a function signature
- **Code Understanding**: Trace how data flows through your application
- **Dead Code Detection**: Find unused exports and functions
- **Dependency Analysis**: Understand coupling between modules
- **Debugging**: Track down where variables or functions are being modified
- **Documentation**: Generate usage examples automatically

The references tool is particularly powerful for large codebases where manual searching would miss subtle references or take significant time. It leverages the Language Server Protocol to provide the same comprehensive analysis that your IDE uses for "Find All References" functionality.