# Inspect Tool - Codebase Symbol Example

The `inspect` tool provides comprehensive information about any symbol at a specific position, including documentation, type signatures, and navigation points to definitions and implementations.

## Example: Inspecting a Function in Our Codebase

**Target:** The `inspectSymbol` function in our LSP operations

**Command:**

```
mcp__symbols__inspect({
  file: "src/lsp/operations/operations.ts",
  line: 94,
  character: 18
})
```

**Output:**

````
Inspect on src/lsp/operations/operations.ts:94:18
    Cursor: `...async func|tion inspe...`
    Target: Unknown token
    Symbol: (Function) inspectSymbol

Documentation
```typescript
function inspectSymbol(ctx: LspContext, request: SymbolPositionRequest): Promise<Result<OperationWithContextResult<SymbolInspection>>>
````

Definition: 1 location where inspectSymbol is defined
src/lsp/operations/operations.ts (1 location)
@94:23
`export async function inspectSymbol(`

Type Definition: 7 locations where the type is defined
src/types.ts (2 locations)
@87:5
`| { ok: true; data: T }`
@88:5
`| { ok: false; error: E };`

Implementation: 1 location where inspectSymbol is implemented
src/lsp/operations/operations.ts (1 location)
@94:23
`export async function inspectSymbol(`

```

## Navigation Example

You can then navigate to any of the provided locations. For example, the definition:

**Follow-up Command:**
```

mcp**symbols**read({
file: "src/lsp/operations/operations.ts",
previewMode: "signature",
maxDepth: 1
})

```

This shows the function structure and its internal organization without overwhelming implementation details.

## Key Benefits

- **Comprehensive Symbol Analysis**: Get documentation, type signature, and all navigation points in one call
- **Precise Positioning**: Cursor context shows exactly what symbol you're inspecting
- **Multi-faceted Navigation**: Definition, type definition, and implementation locations
- **TypeScript Integration**: Full TypeScript compiler understanding including complex return types
- **Seamless Exploration**: Each location can be explored further with `read` or `inspect` tools

## Use Cases

- **Understanding APIs**: Get complete function signature and documentation
- **Code Navigation**: Jump to definitions, implementations, or type declarations
- **Type Discovery**: Understand complex TypeScript types and their relationships
- **Codebase Exploration**: Discover how symbols relate to each other
- **Debugging**: Trace symbol definitions and usages across the codebase

The inspect tool is particularly powerful because it leverages the Language Server Protocol to provide the same information your IDE would show, but in a programmatically accessible format for AI assistance.
```
