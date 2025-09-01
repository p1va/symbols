# Inspect Tool - Third-Party Library Example

The `inspect` tool works seamlessly with third-party libraries, providing the same level of detail for external dependencies as it does for your own codebase.

## Example: Inspecting vscode-jsonrpc Library Function

**Target:** The `createMessageConnection` function from the vscode-jsonrpc library used in our LSP client

**Command:**

```
mcp__symbols__inspect({
  file: "src/lsp-client.ts",
  line: 237,
  character: 31
})
```

**Output:**

````
Inspect on src/lsp-client.ts:237:31
    Cursor: `... = rpc.cre|ateMessage...`
    Target: (function) createMessageConnection
    Symbol: (Constant) connection

Documentation
```typescript
(alias) createMessageConnection(messageReader: rpc.MessageReader, messageWriter: rpc.MessageWriter, _logger?: rpc.Logger, options?: rpc.ConnectionOptions): rpc.MessageConnection
export createMessageConnection
````

Definition: 1 location where connection is defined
node_modules/.pnpm/vscode-jsonrpc@8.2.1/node_modules/vscode-jsonrpc/lib/common/connection.d.ts (1 location)
@357:25
`export declare function createMessageConnection(messageReader: MessageReader, messageWriter:...`

Type Definition: 1 location where the type is defined
node_modules/.pnpm/vscode-jsonrpc@8.2.1/node_modules/vscode-jsonrpc/lib/common/connection.d.ts (1 location)
@291:18
`export interface MessageConnection {`

Implementation: 3 locations where connection is implemented
node_modules/.pnpm/vscode-jsonrpc@8.2.1/node_modules/vscode-jsonrpc/lib/common/api.d.ts (2 locations)
node_modules/.pnpm/vscode-jsonrpc@8.2.1/node_modules/vscode-jsonrpc/lib/common/connection.d.ts (1 location)

```

## Exploring the Library Definition

**Follow-up Command:**
```

mcp**symbols**read({
file: "node_modules/.pnpm/vscode-jsonrpc@8.2.1/node_modules/vscode-jsonrpc/lib/common/connection.d.ts",
previewMode: "signature",
maxDepth: 2
})

```

**Result Sample:**
```

Found 220 symbols in file (max depth 2)

@357:1 Function - createMessageConnection
`export declare function createMessageConnection(messageReader: MessageReader, messageWriter:...`

@291:1 Interface - MessageConnection
`export interface MessageConnection { sendRequest<R, E>(type: RequestType0<R, E>, token?:...`
@292:5 Method - sendRequest
`sendRequest<R, E>(type: RequestType0<R, E>, token?: CancellationToken): Promise<R>;`
@293:5 Method - sendRequest
`sendRequest<P, R, E>(type: RequestType<P, R, E>, params: P, token?: CancellationToken): Promise<R>;`
[... 50+ more overloads and methods]

```

## Key Benefits for Third-Party Libraries

- **Library API Discovery**: Understand complex library interfaces without consulting external documentation
- **Type-Accurate Information**: Get precise TypeScript signatures for proper integration
- **Overload Understanding**: See all function overloads and their specific use cases
- **Dependency Navigation**: Jump directly to library source files for deeper understanding
- **Integration Confidence**: Verify parameter types and return values before implementation
- **Version-Specific Info**: Get information for the exact version in your project

## Use Cases

- **Learning New Libraries**: Understand APIs before writing integration code
- **Debugging Integration Issues**: Verify you're calling library functions correctly
- **Type Safety**: Get accurate TypeScript types for library functions
- **Migration Planning**: Understand breaking changes when upgrading library versions
- **Documentation Gaps**: When library documentation is incomplete or unclear

The inspect tool eliminates the need to constantly switch between your code and library documentation, providing instant access to comprehensive API information directly in your development workflow.
```
