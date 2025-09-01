# Completion Tool Example

The `completion` tool provides intelligent code completion suggestions at any cursor position, showing available methods, properties, and other members for objects and modules.

## Example: Getting Completion Suggestions for LSP Client

**Context:** Working with an LSP client object and wanting to see available methods

### Completing on the Client Object

**Command:**
```
mcp__symbols__completion({ 
  file: "src/lsp/operations/operations.ts", 
  line: 141, 
  character: 20 
})
```

**Output:**
```
Completion on src/lsp/operations/operations.ts:141:20
    Cursor: `...   client.|connection...`
    Target: (property) connection
    Symbol: (Function) tryResultAsync() callback

Found 5 completion suggestions

Classs (5)
  clientCapabilities?
  connection
  isInitialized
  processId?
  serverCapabilities?
```

### Completing on the Connection Object

**Command:**
```
mcp__symbols__completion({ 
  file: "src/lsp/operations/operations.ts", 
  line: 141, 
  character: 31 
})
```

**Output:**
```
Completion on src/lsp/operations/operations.ts:141:31
    Cursor: `...onnection.|sendReques...`
    Target: (member) sendRequest
    Symbol: (Function) tryResultAsync() callback

Found 17 completion suggestions

Modules (12)
  dispose
  end
  hasPendingResponse
  inspect
  listen
  onNotification
  onProgress
  onRequest
  sendNotification
  sendProgress
  sendRequest
  trace

Classs (5)
  onClose
  onDispose
  onError
  onUnhandledNotification
  onUnhandledProgress
```

## Key Benefits

- **Instant API Discovery**: See all available methods and properties on any object
- **Type-Aware Suggestions**: Get completions based on actual TypeScript types
- **Context-Sensitive**: Suggestions change based on the specific object type at cursor position  
- **Categorized Results**: Methods grouped by type (Modules, Classes, etc.) for easy scanning
- **Real-Time Intelligence**: Same completions your IDE would show, but programmatically accessible

## Use Cases

- **API Exploration**: Discover available methods on objects without consulting documentation
- **Faster Development**: Reduce typing and eliminate guesswork about method names
- **Learning Codebases**: Understand what operations are possible on different objects
- **IDE-Free Development**: Get intelligent completions in any context, even without an IDE
- **Code Generation**: Programmatically generate code with accurate method calls
- **Debugging**: Verify expected methods are available on objects at runtime

The completion tool provides the same intelligent suggestions your TypeScript-aware editor would show, making it invaluable for AI-assisted development where understanding available APIs is crucial for generating correct code.