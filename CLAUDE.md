# symbols

## What we do

We are building an MCP (Model Context Protocol) server called "symbols" that provides a set of tools for a more productive and precise way to explore and work in a codebase.
This server under the hood spawn, interact and orchestrating requests to a Language Server based on the LSP specs.
Right now we are developing against the Typescript language server but the goal is to build a generic tool which we can use with most language servers.
You are both working in the codebase where these tools source code is and using their last successful build via MCP.

## Decisions

- We have chosen Typescript as the language and pnpm as the package manager.
- We want to enfore strict type safety to benefit from the typescript compiler when developing
- We have chosen to use **pure functional approach** and write modern TS preferring functional patterns to OOP

## Tool Usage Policy Addendum

The MCP server provides the following tools:

- Prefer **`mcp__symbols__search`** when searching for symbols (e.g. function names, types, ect), use your usual tool for other kinds of searches (e.g. \*.ts)
- When discovering prefer **`mcp__symbols__read`** first and start with previewMode: `none` to get a sense of what is in there then if needed increase to `signature` or `full` symbols in a given file with different level of details.
- Use **`mcp__symbols__inspect`** when unsure about what a given symbol does, where it lives, which signature it needs. Then eventually keep exploring the suggested definition, implementation locations with `mcp__symbols__read`
- **`mcp__symbols__completion`**: suggests a list of completions
- Use **`mcp__symbols__references`** when looking for a symbol references across the codebase
- Use **`mcp__symbols__rename`** when wanting to rename a symbol across the codebase
- Use **`mcp__symbols__diagnostics`** to retrieve active diagnostics for a given document

## Core Architecture

### 1. **MCP Server Layer** (`src/main/`)

- **Main Entry**: `src/main/index.ts` - Context creation and initialization
- **Server Factory**: `src/main/createServer.ts` - MCP server creation
- **LSP Client**: `src/lsp-client.ts` - LSP communication layer

### 2. **Tools Layer** (`src/tools/`)

- **Tool Registration**: `src/tools/index.ts` - Registers all 8 MCP tools
- **Individual Tools**: Each tool has its own file with registration and formatting logic
- **Tool Types**: read, inspect, search, references, completion, rename, diagnostics, logs

### 3. **LSP Operations** (`src/lsp/operations/`)

- **Core Operations**: `src/lsp/operations/operations.ts` - LSP request handlers
- **File Lifecycle**: `src/lsp/fileLifecycle/` - File management for LSP operations

### 4. **State Management** (`src/state/`)

- **Stores**: `src/state/stores.ts` - DiagnosticsStore, WindowLogStore, WorkspaceState
- **Coordination**: `src/state/index.ts` - State management coordination

## The 8 MCP Tools (✅ Implemented)

1. **`read`** - Get document symbols with 4-tier preview system (none/signature/full/raw)
2. **`inspect`** - Comprehensive symbol info (hover + all navigation)
3. **`references`** - Find all uses of a symbol across the codebase
4. **`completion`** - Code completion suggestions at cursor position
5. **`search`** - Search symbols across workspace by query
6. **`rename`** - Rename symbol across entire codebase
7. **`diagnostics`** - Get errors/warnings for a file
8. **`logs`** - Access LSP server log messages

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

- ✅ **Complete MCP Server Implementation** - All 8 tools fully implemented and working
- ✅ **LSP Communication Layer** - Robust TypeScript LSP client with proper lifecycle management
- ✅ **4-Tier Symbol Reading** - Sophisticated preview system (none/signature/full/raw)
- ✅ **Type Safety** - Strict TypeScript with comprehensive error handling
- ✅ **State Management** - Proper stores for diagnostics, logs, and workspace state
- ✅ **File Lifecycle Management** - Efficient preloaded file handling

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
mcp__symbols__read("node_modules/vscode-jsonrpc/lib/node/main.d.ts", maxDepth: 3)
```

#### **Inspecting Import/Export Types**

When facing TypeScript import errors or wanting to understand available exports:

```typescript
// Use inspect tool on import statements to see resolved types
mcp__symbols__inspect(file: "playground/dotnet.ts", line: 20, character: 25)
// Shows where 'vscode-jsonrpc' resolves and what's available

// Use get_symbols to explore declaration files in detail
mcp__symbols__read("node_modules/vscode-jsonrpc/node.d.ts", maxDepth: 2)
```

#### **Understanding Function Overloads**

When encountering issues with function signatures or overloads:

```typescript
// Inspect specific function calls to see all available overloads
mcp__symbols__inspect(file: "playground/dotnet.ts", line: 45, character: 31)
// Shows createMessageConnection overloads and their type signatures
```

#### **Benefits of This Approach**

- **Type-accurate**: Gets actual TypeScript compiler understanding
- **Comprehensive**: Shows all overloads, exports, and type relationships
- **Context-aware**: Understands module resolution in your specific project
- **Documentation**: Includes JSDoc and type information
- **No runtime needed**: Works purely from TypeScript declarations

This approach is much more reliable than runtime inspection and provides the exact information TypeScript uses for compilation.

## Usage

The MCP server is fully implemented and ready for use. All 8 tools provide comprehensive LSP-based code intelligence for Claude Code, enabling precise codebase exploration and manipulation with strict type safety and functional programming patterns.

# Tool Usage Policy Addendum

## Read Tool - Four-Tier Preview System

The `read` tool in the `typescript-new` MCP server provides a sophisticated four-tier system for exploring code with different levels of detail. This allows users to choose the optimal information density for their specific use case.

### 1. **None Mode** (`previewMode: 'none'`)

- **Use Case**: Quick architectural overview and file structure understanding
- **Output**: Symbol names with hierarchical organization only
- **Best For**: "What's in this file?" - rapid scanning of code organization

### 2. **Signature Mode** (`previewMode: 'signature'`)

- **Use Case**: API exploration and interface understanding
- **Output**: Symbol names + condensed type signatures in backticks on new lines
- **Best For**: "How do I use this API?" - understanding function parameters, return types, and method overloads

### 3. **Full Mode** (`previewMode: 'full'`)

- **Use Case**: Implementation understanding and algorithm analysis
- **Output**: Complete code blocks for leaf symbols only (prevents duplication)
- **Best For**: "How does this work?" - seeing full function logic, error handling, and business rules
- **Key Feature**: Leaf symbol detection eliminates duplication by only showing code blocks for symbols with no children

### 4. **Raw File Reading** (Standard `Read` tool)

- **Use Case**: Complete context including imports, comments, and exact formatting
- **Output**: Entire source file with line numbers
- **Best For**: "I need full context" - understanding module structure, dependencies, and exact source

### Smart Leaf Symbol Detection

The `full` mode implements intelligent leaf symbol detection to prevent code duplication:

- **Container symbols** (classes, interfaces with properties, modules) show structure only
- **Leaf symbols** (individual methods, properties, standalone functions) show complete implementations
- **Result**: No redundant class definitions while preserving detailed method implementations

### Usage Examples

```typescript
// Architecture overview
mcp__symbols__read({ file: 'src/tools/read.ts', previewMode: 'none' });

// API exploration with signatures
mcp__symbols__read({ file: 'src/tools/read.ts', previewMode: 'signature' });

// Implementation details
mcp__symbols__read({ file: 'src/tools/read.ts', previewMode: 'full' });

// Complete context
Read({ file_path: '/path/to/file.ts' });
```

### When to Use Each Mode

- **`none`**: Initial code exploration, understanding file architecture
- **`signature`**: API documentation, understanding interfaces and method signatures
- **`full`**: Code review, debugging, understanding complex algorithms
- **Raw file**: Import analysis, seeing complete file context, exact formatting needs

This tiered approach provides surgical precision in information density, allowing users to get exactly the right level of detail for their current task without information overload or missing context.

## Development Guidelines

- Follow strict TypeScript patterns and type safety rules (@docs/TYPE_SAFETY.md)
- Use functional programming approach - prefer pure functions over OOP
- All builds must pass (`pnpm build`) - type safety violations will fail the build
