# TypeScript LSP-to-MCP Server Project

## Project Overview

We are building a **TypeScript MCP (Model Context Protocol) server** that provides intelligent code navigation and analysis tools by orchestrating LSP (Language Server Protocol) requests internally. This server will help Claude Code understand and navigate TypeScript codebases more effectively.

## Background & Context

### Original C# Implementation

- We have an existing C# tool (MCP server) called **"typescript"** that provides similar functionality
- The C# version uses ApplicationService pattern with comprehensive LSP orchestration
- Detailed specification available in `TYPESCRIPT_IMPLEMENTATION_SPEC.md`
- Analysis of the C# approach documented in `MCP_SERVER_UNDERSTANDING.md`

### Why TypeScript Port?

- **TypeScript-native**: Better suited for TypeScript language server integration
- **Modern patterns**: Embrace functional programming over OOP translation
- **Performance**: Direct JSON-RPC communication without C# overhead
- **Maintenance**: Easier for TypeScript developers to contribute

## Architecture Decision

We chose a **pure functional approach** (documented in `IMPLEMENTATION_PLAN.md`) because:

- **TypeScript-idiomatic**: Modern TS/JS functional patterns vs OOP
- **Precise dependencies**: Functions only receive what they need
- **Highly testable**: Easy to mock specific dependencies
- **Composable**: Pure functions that combine easily

## Core Components

### 1. **MCP Server Layer** (`index.ts`)

- Registers 8 MCP tools that Claude Code can use
- Handles tool requests and response formatting
- Manages module-level state (LSP connection, stores)

### 2. **LspOperations** (Public API)

Only functions corresponding to actual MCP tools:

```typescript
export const inspectSymbol = async (client, preloadedFiles, request) =>
  Promise<Result<InspectSymbolResult>>;
export const findReferences = async (client, preloadedFiles, request) =>
  Promise<Result<SymbolLocation[]>>;
export const getCompletion = async (client, preloadedFiles, request) =>
  Promise<Result<CompletionItem[]>>;
export const searchSymbols = async (client, query) =>
  Promise<Result<WorkspaceSymbol[]>>;
export const getDocumentSymbols = async (client, preloadedFiles, request) =>
  Promise<Result<DocumentSymbol[]>>;
export const getDiagnostics = async (
  client,
  diagnosticsStore,
  preloadedFiles,
  request
) => Promise<Result<Diagnostic[]>>;
export const renameSymbol = async (client, preloadedFiles, request) =>
  Promise<Result<RenameResult>>;
export const getWindowLogMessages = async (windowLogStore) =>
  Promise<Result<WindowLogMessage[]>>;
export const initialize = async (client, config, preloadedFiles) =>
  Promise<Result<InitializeResult>>;
```

### 3. **Internal Helpers** (Private)

LSP request functions and utilities that are implementation details:

- `getDefinitionInternal`, `getHoverInternal`, `getTypeDefinitionInternal`, etc.
- `findSymbolAtPosition`, `enrichWithText`, `executeWithFileLifecycle`
- These are NOT exported - purely internal to operations

## The 8 MCP Tools We're Building

1. **`initialize`** - Set up LSP connection and workspace
2. **`inspect_symbol`** - Comprehensive symbol info (hover + all navigation)
3. **`find_references`** - Find all uses of a symbol
4. **`get_completion`** - Code completion suggestions
5. **`search_symbols`** - Search symbols across workspace
6. **`rename_symbol`** - Rename symbol across codebase
7. **`get_document_symbols`** - Get all symbols in a file
8. **`get_diagnostics`** - Get errors/warnings for a file
9. **`get_window_logs`** - Access LSP server log messages

## Critical Implementation Details

### **Position Coordinates**

- **User/MCP**: 1-based (line 1, character 1)
- **LSP Protocol**: 0-based (line 0, character 0)
- **Always convert**: Critical for correct LSP communication

### **File Lifecycle Management**

- **Preloaded files**: Special handling to maintain project context
- **Regular files**: Standard open → operate → close pattern
- **One lifecycle per tool call**: More efficient than per-internal-operation

### **Text Enrichment**

- Every symbol location gets actual source code snippets
- Helps Claude Code see both location AND the actual code
- Essential for useful MCP responses

## Development Approach

### **Current Development State**

- ✅ Basic LSP communication working (see `playground/dotnet.ts`)
- ✅ MCP TypeScript tools available for reference during development
- ✅ Architecture and implementation plan documented
- ✅ **typescript-new MCP server running** - Basic MCP infrastructure working (tested with example_tool)
- 🔄 Ready to implement the 8 LSP tools (currently only has example addition tool)

### **Using Existing "typescript" MCP Tool During Development**

The existing C# "typescript" MCP tool is available and should be used during development:

- **Reference implementation**: Compare outputs and behavior
- **Testing**: Validate our TypeScript implementation against C# version
- **Development aid**: Use for understanding codebase while building
- **Debugging**: Cross-reference when TypeScript version has issues

### **Recommended Tool Usage for Development**

Use the existing TypeScript MCP tools to understand module structures and resolve typing issues:

#### **Understanding Module Exports**

Instead of using `console.log(Object.keys(require('module')))` or similar runtime inspection:

```typescript
// ❌ Runtime inspection (not available in strict TypeScript)
console.log(Object.keys(require('vscode-jsonrpc')));

// ✅ Use TypeScript MCP tools
mcp__typescript__get_symbols("node_modules/vscode-jsonrpc/lib/node/main.d.ts", maxDepth: 3)
```

#### **Inspecting Import/Export Types**

When facing TypeScript import errors or wanting to understand available exports:

```typescript
// Use inspect tool on import statements to see resolved types
mcp__typescript__inspect(file: "playground/dotnet.ts", line: 20, character: 25)
// Shows where 'vscode-jsonrpc' resolves and what's available

// Use get_symbols to explore declaration files in detail
mcp__typescript__get_symbols("node_modules/vscode-jsonrpc/node.d.ts", maxDepth: 2)
```

#### **Understanding Function Overloads**

When encountering issues with function signatures or overloads:

```typescript
// Inspect specific function calls to see all available overloads
mcp__typescript__inspect(file: "playground/dotnet.ts", line: 45, character: 31)
// Shows createMessageConnection overloads and their type signatures
```

#### **Benefits of This Approach**

- **Type-accurate**: Gets actual TypeScript compiler understanding
- **Comprehensive**: Shows all overloads, exports, and type relationships
- **Context-aware**: Understands module resolution in your specific project
- **Documentation**: Includes JSDoc and type information
- **No runtime needed**: Works purely from TypeScript declarations

This approach is much more reliable than runtime inspection and provides the exact information TypeScript uses for compilation.

### **Implementation Phases**

1. **Phase 1**: Core infrastructure (context, config, file lifecycle)
2. **Phase 2**: Simple operations (init, logs, document symbols, diagnostics)
3. **Phase 3**: Complex operations (references, search, completion)
4. **Phase 4**: Advanced operations (inspect symbol orchestration, rename)

## Key Files & Documentation

### **Planning & Analysis**

- `PLAN.md` - Original C# analysis and request/notification mapping
- `TYPESCRIPT_IMPLEMENTATION_SPEC.md` - Detailed C# implementation spec
- `MCP_SERVER_UNDERSTANDING.md` - Our analysis and understanding
- `IMPLEMENTATION_PLAN.md` - **Main technical implementation guide**

### **Code**

- `playground/dotnet.ts` - Working LSP communication examples
- `index.ts` - MCP server entry point (to be implemented)
- `src/LspOperations.ts` - Public tool functions (to be implemented)
- `src/lsp-internals.ts` - Private helper functions (to be implemented)

## Testing Strategy

### **Available Tools for Testing**

- **Existing MCP "typescript" tool**: Reference implementation
- **TypeScript LSP server**: Real language server for integration tests
- **Playground**: Direct LSP communication testing

### **Test Types**

- **Unit**: Pure functions with mocked dependencies
- **Integration**: Real LSP server communication
- **End-to-end**: Full MCP tool workflow
- **Comparison**: TypeScript vs C# implementation outputs

## Success Criteria

1. **Functional parity**: All 8 tools work as well as C# version
2. **Performance**: Comparable or better response times
3. **Type safety**: Full TypeScript type coverage
4. **Maintainability**: Clear functional patterns, easy to extend
5. **Claude Code integration**: Provides useful code navigation for Claude

## Getting Started

1. **Review**: Read `IMPLEMENTATION_PLAN.md` for detailed technical approach
2. **Reference**: Use existing "typescript" MCP tool for comparison
3. **Test**: Run `pnpm play playground/dotnet.ts` to see LSP communication
4. **Implement**: Start with Phase 1 (core infrastructure)
5. **Validate**: Compare outputs with existing C# implementation

The goal is to build a robust, maintainable TypeScript MCP server that provides excellent code intelligence for Claude Code while embracing modern TypeScript functional programming patterns.
