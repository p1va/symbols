# symbols

## What we do

We are building an MCP (Model Context Protocol) server that provides a set of tools intended to offer a more productive way of navigating the codebase. This is done by spawning, interacting and orchestrating requests to a Language Server based on the Language Server Protocol specs.
You are both developing these tools in this codebase and using its last successful build via MCP.

## Decisions

- We have chosen Typescript as the language and pnpm as the package manager.
- We want to enfore strict type safety to benefit from the typescript compiler when developing
- We have chosen to use **pure functional approach**
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
mcp__typescript - new__read({ file: 'src/tools/read.ts', previewMode: 'none' });

// API exploration with signatures
mcp__typescript -
  new__read({ file: 'src/tools/read.ts', previewMode: 'signature' });

// Implementation details
mcp__typescript - new__read({ file: 'src/tools/read.ts', previewMode: 'full' });

// Complete context
Read({ file_path: '/path/to/file.ts' });
```

### When to Use Each Mode

- **`none`**: Initial code exploration, understanding file architecture
- **`signature`**: API documentation, understanding interfaces and method signatures
- **`full`**: Code review, debugging, understanding complex algorithms
- **Raw file**: Import analysis, seeing complete file context, exact formatting needs

This tiered approach provides surgical precision in information density, allowing users to get exactly the right level of detail for their current task without information overload or missing context.

# TypeScript Type Safety Guidelines

## Critical Type Safety Rules

**STRICT ENFORCEMENT**: The build will fail if any of these violations are present. We use ESLint before TypeScript compilation to catch type safety issues early.

### 1. **NEVER Use Explicit `any` Types**

```typescript
// ❌ FORBIDDEN - Explicit any types
function process(data: any): any {
  return data.someProperty;
}

// ✅ REQUIRED - Proper typing
function process<T>(data: T): string {
  return (data as { someProperty: string }).someProperty;
}

// ✅ BETTER - Use proper interfaces
interface DataWithProperty {
  someProperty: string;
}
function process(data: DataWithProperty): string {
  return data.someProperty;
}
```

### 2. **Handle Unknown Types Properly**

```typescript
// ❌ FORBIDDEN - any casting
const result = (response as any).data;

// ✅ REQUIRED - Type guards and proper checking
function isResponseWithData(obj: unknown): obj is { data: unknown } {
  return typeof obj === 'object' && obj !== null && 'data' in obj;
}

if (isResponseWithData(response)) {
  const result = response.data;
}

// ✅ ALTERNATIVE - Use proper typing from libraries
import { LSPResponse } from 'vscode-languageserver-protocol';
const result: LSPResponse = response;
```

### 3. **Proper Promise Handling**

```typescript
// ❌ FORBIDDEN - Floating promises
client.sendRequest('textDocument/definition', params);

// ✅ REQUIRED - Always handle promises
await client.sendRequest('textDocument/definition', params);

// ✅ ALTERNATIVE - Explicit void for fire-and-forget
void client.sendRequest('textDocument/definition', params);

// ✅ PROPER - With error handling
try {
  const result = await client.sendRequest('textDocument/definition', params);
  return result;
} catch (error) {
  console.error('LSP request failed:', error);
  throw error;
}
```

### 4. **Function Type Definitions**

```typescript
// ❌ FORBIDDEN - Generic Function type
const handler: Function = (data) => { ... };

// ✅ REQUIRED - Specific function signatures
type EventHandler = (data: EventData) => Promise<void>;
const handler: EventHandler = async (data) => { ... };

// ✅ ALTERNATIVE - Inline function types
const handler: (data: EventData) => Promise<void> = async (data) => { ... };
```

### 5. **Method Binding and `this` Context**

```typescript
// ❌ FORBIDDEN - Unbound method references
process.on('exit', client.dispose);

// ✅ REQUIRED - Proper binding
process.on('exit', () => client.dispose());

// ✅ ALTERNATIVE - Explicit void annotation for methods without this
class Client {
  dispose(this: void): void { ... }
}
process.on('exit', client.dispose); // Now safe
```

### 6. **Unused Variables and Parameters**

```typescript
// ❌ FORBIDDEN - Unused parameters
function handler(method: string, params: any) {
  console.log('handling request');
}

// ✅ REQUIRED - Use underscore prefix for intentionally unused
function handler(_method: string, _params: RequestParams) {
  console.log('handling request');
}

// ✅ BETTER - Remove unused parameters entirely
function handler() {
  console.log('handling request');
}
```

### 7. **LSP Protocol Type Usage**

```typescript
// ❌ FORBIDDEN - Manual type definitions for LSP
interface Position {
  line: number;
  character: number;
}

// ✅ REQUIRED - Use official LSP types
import { Position, Location, Range } from 'vscode-languageserver-protocol';

function getDefinition(position: Position): Promise<Location[]> {
  // Implementation
}
```

### 8. **Generic Constraints and Type Safety**

```typescript
// ❌ FORBIDDEN - Unconstrained generics that lead to any
function processLspResponse<T>(response: T): T {
  return (response as any).result;
}

// ✅ REQUIRED - Proper generic constraints
interface LspResponse<T> {
  id: number;
  result: T;
}

function processLspResponse<T>(response: LspResponse<T>): T {
  return response.result;
}
```

## Development Workflow

### Before Implementing

1. **Use existing MCP TypeScript tools** to understand type structures:

   ```typescript
   // Explore LSP protocol types
   mcp__typescript__get_symbols("node_modules/vscode-languageserver-protocol/lib/common/protocol.d.ts")

   // Understand function signatures
   mcp__typescript__inspect(file: "src/file.ts", line: X, character: Y)
   ```

2. **Check imports and exports** before using external libraries
3. **Define interfaces first** before implementing functions

### During Implementation

1. **Never use `any`** - always find the proper type
2. **Use type assertions sparingly** and with type guards
3. **Handle all promise chains** with await or explicit void
4. **Remove unused variables** or prefix with underscore

### Before Committing

1. **Run `pnpm build`** - must pass without errors
2. **Check that all LSP protocol interactions are properly typed**
3. **Verify no floating promises or unsafe operations**

## Build Commands Reference

- `pnpm lint` - Show violations without building
- `pnpm lint:fix` - Auto-fix simple violations
- `pnpm build` - **MUST PASS** - Lint + TypeScript compilation
- Build failure = type safety violations that must be fixed

## Type Safety Best Practices - Lessons Learned

### **Preventing Type Safety Drift**

Based on our experience fixing 291 type safety violations, here are key practices to prevent future drift:

#### 1. **Build Early and Often**

```bash
# Run before every commit - build must pass
pnpm build

# Quick type check without artifacts
npx tsc --noEmit
```

#### 2. **Progressive Type Safety**

```typescript
// ✅ GOOD - Start with proper types from the beginning
function processLspResponse(response: LspResponse): Location[] {
  return response.locations;
}

// ❌ AVOID - Don't use any as a "temporary" solution
function processLspResponse(response: any): any {
  return response.locations; // This "temporary" fix becomes permanent
}
```

#### 3. **Discriminated Unions for Complex Types**

```typescript
// ✅ RECOMMENDED - Use discriminated unions for LSP response types
type LspLocationResponse =
  | { type: 'single'; location: Location }
  | { type: 'multiple'; locations: Location[] }
  | { type: 'none'; locations: null };

function handleLocationResponse(response: LspLocationResponse) {
  switch (response.type) {
    case 'single':
      return [response.location];
    case 'multiple':
      return response.locations;
    case 'none':
      return [];
  }
}
```

#### 4. **Type Guards for Safety**

```typescript
// ✅ REQUIRED - Create type guards for uncertain data
function isLocationArray(data: unknown): data is Location[] {
  return (
    Array.isArray(data) &&
    data.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'uri' in item &&
        'range' in item
    )
  );
}

function processLocations(response: unknown): Location[] {
  if (isLocationArray(response)) {
    return response; // TypeScript knows this is Location[]
  }
  return [];
}
```

#### 5. **Test Type Safety**

```typescript
// ✅ GOOD - Create proper mock types
type MockLspClient = Pick<LspClient, 'connection' | 'isInitialized'>;

const mockClient: MockLspClient = {
  connection: {
    /* proper mock */
  },
  isInitialized: true,
};

// ❌ AVOID - Don't use any for test mocks
const mockClient = {
  connection: vi.fn() as any, // Type safety lost
  isInitialized: true,
};
```

#### 6. **Handle Optional Properties Explicitly**

```typescript
// ✅ REQUIRED - Always check optional properties
function processSymbol(symbol: { uri?: string; range?: Range }) {
  if (!symbol.uri || !symbol.range) {
    return null; // Explicit handling of missing properties
  }
  return { uri: symbol.uri, range: symbol.range }; // TypeScript knows these exist
}

// ❌ FORBIDDEN - Direct access to optional properties
function processSymbol(symbol: { uri?: string; range?: Range }) {
  return { uri: symbol.uri, range: symbol.range }; // uri and range might be undefined
}
```

#### 7. **Red Flags - Stop and Fix Immediately**

Watch for these patterns that indicate growing type safety debt:

- **Multiple `as any` in the same file** → Time to create proper types
- **ESLint disable comments growing** → Type system is fighting your design
- **"TODO: fix types" comments** → These never get fixed, address immediately
- **Build time increasing significantly** → Type checking overhead from poor types

#### 8. **Tools and Workflow**

```bash
# Set up pre-commit hooks to prevent type safety violations
echo "pnpm build" > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Use TypeScript strict mode features
# tsconfig.json should include:
"exactOptionalPropertyTypes": true,
"noUncheckedIndexedAccess": true,
"strict": true
```

#### 9. **Emergency Type Safety Restoration**

If you find type safety has drifted significantly:

1. **Isolate the scope**: `npx tsc --noEmit 2>&1 | head -20`
2. **Fix by area**: Start with core types (not tests)
3. **Use discriminated unions**: For complex response handling
4. **Create type guards**: For runtime safety
5. **Add proper tests**: With correct mock types

### **Key Insight**

Type safety violations compound exponentially. Fixing 1 violation immediately is easier than fixing 291 violations later. The build pipeline is your safety net - never allow it to fail for extended periods.
