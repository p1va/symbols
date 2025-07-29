# TypeScript LSP-to-MCP Service Layer Implementation Plan

## Overview

This document outlines our plan for implementing the service layer that orchestrates LSP requests to fulfill MCP tool requests. This layer sits between the MCP server and the TypeScript language server, providing intelligent tooling for Claude Code.

## Architecture Decision: Pure Functional Approach

We've chosen a **pure functional approach** with minimal dependency passing because:

- **TypeScript-Idiomatic**: Embraces modern TS/JS functional patterns rather than OOP
- **Precise Dependencies**: Functions only receive what they actually need
- **Highly Testable**: Easy to mock only required dependencies
- **Composable**: Pure functions that can be easily combined and reused
- **Clear Contracts**: Explicit function signatures show exactly what each operation needs

## Core Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   MCP Server    │◄──►│  LspOperations   │◄──►│ TypeScript LSP      │
│   (8 tools)     │    │ (Pure Functions) │    │ Language Server     │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Stateful Stores │
                       │ - Window Logs   │
                       │ - Diagnostics   │
                       │ - Preloaded Set │
                       └─────────────────┘
```

## Key Components

### 1. **LspContext** - Module-Level State Container

```typescript
type LspContext = {
  client: ILspClient;
  config: LspProfileConfig;
  preloadedFiles: Set<string>;
  windowLogStore: WindowLogMessageStore;
  diagnosticsStore: DiagnosticsStore;
};

// Module-level state (similar to Next.js API route patterns)
let lspContext: LspContext | null = null;
```

### 2. **LspOperations** - Public MCP Tool Functions

```typescript
// Only functions that correspond to actual MCP tools - NO internal helpers
export const inspectSymbol = async (
  client: ILspClient,
  preloadedFiles: Set<string>,
  request: { filePath: string; position: { line: number; character: number } }
): Promise<Result<InspectSymbolResult>>;

export const findReferences = async (
  client: ILspClient,
  preloadedFiles: Set<string>,
  request: { filePath: string; position: { line: number; character: number } }
): Promise<Result<SymbolLocation[]>>;

export const getCompletion = async (
  client: ILspClient,
  preloadedFiles: Set<string>,
  request: { filePath: string; position: { line: number; character: number } }
): Promise<Result<CompletionItem[]>>;

export const searchSymbols = async (
  client: ILspClient,
  query: string
): Promise<Result<WorkspaceSymbol[]>>;

export const getDocumentSymbols = async (
  client: ILspClient,
  preloadedFiles: Set<string>,
  request: { filePath: string }
): Promise<Result<DocumentSymbol[]>>;

export const getDiagnostics = async (
  client: ILspClient,
  diagnosticsStore: DiagnosticsStore,
  preloadedFiles: Set<string>,
  request: { filePath: string }
): Promise<Result<Diagnostic[]>>;

export const renameSymbol = async (
  client: ILspClient,
  preloadedFiles: Set<string>,
  request: { filePath: string; position: { line: number; character: number }; newName: string }
): Promise<Result<RenameResult>>;

export const getWindowLogMessages = async (
  windowLogStore: WindowLogMessageStore
): Promise<Result<WindowLogMessage[]>>;

export const initialize = async (
  client: ILspClient,
  config: LspProfileConfig,
  preloadedFiles: Set<string>
): Promise<Result<InitializeResult>>;
```

### 3. **Internal Helper Functions** - Private Implementation Details

```typescript
// lsp-internals.ts - NOT exported, purely internal
const getDefinitionInternal = async (client: ILspClient, fileUri: string, position: Position): Promise<any>;
const getTypeDefinitionInternal = async (client: ILspClient, fileUri: string, position: Position): Promise<any>;
const getImplementationInternal = async (client: ILspClient, fileUri: string, position: Position): Promise<any>;
const getHoverInternal = async (client: ILspClient, fileUri: string, position: Position): Promise<any>;
const getDocumentSymbolsInternal = async (client: ILspClient, fileUri: string): Promise<any>;

// Helper functions
const findSymbolAtPosition = (symbols: any[], position: Position): any;
const enrichWithText = async (locations: any[]): Promise<SymbolLocation[]>;
const executeWithFileLifecycle = async <T>(client: ILspClient, preloadedFiles: Set<string>, filePath: string, operation: (fileUri: string) => Promise<T>): Promise<T>;
```

## Critical Implementation Details

### 1. **Position Coordinate Conversion**

- **User/MCP Interface**: 1-based coordinates (line 1, character 1)
- **LSP Protocol**: 0-based coordinates (line 0, character 0)
- **Always convert**: `toZeroBased()` before LSP calls, `toOneBased()` for results

### 2. **File Lifecycle Management**

```typescript
const executeWithFileLifecycle = async <T>(
  client: ILspClient,
  preloadedFiles: Set<string>,
  filePath: string,
  operation: (fileUri: string) => Promise<T>
): Promise<T> => {
  const fileUri = `file://${path.resolve(filePath)}`;
  const isPreloaded = preloadedFiles.has(filePath);

  if (isPreloaded) {
    // Special handling: signal activity, close, reopen, operate, reopen
    await client.sendNotification('textDocument/didChange', {
      textDocument: { uri: fileUri, version: 1 },
      contentChanges: [],
    });
    await closeFile(client, fileUri);
    await openFile(client, fileUri);

    try {
      return await operation(fileUri);
    } finally {
      await openFile(client, fileUri); // Keep preloaded file open
    }
  } else {
    // Standard lifecycle: open, operate, close
    await openFile(client, fileUri);
    try {
      return await operation(fileUri);
    } finally {
      await closeFile(client, fileUri);
    }
  }
};
```

### 3. **Text Enrichment**

Every symbol location gets enriched with actual source code:

```typescript
const enrichWithText = async (locations: any[]): Promise<SymbolLocation[]> => {
  return await Promise.all(
    locations.map(async (location) => {
      try {
        const filePath = location.uri.replace('file://', '');
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const text = extractTextFromRange(lines, location.range);

        return {
          filePath,
          range: {
            start: {
              line: location.range.start.line + 1,
              character: location.range.start.character + 1,
            },
            end: {
              line: location.range.end.line + 1,
              character: location.range.end.character + 1,
            },
          },
          text: text.trim(),
        };
      } catch (error) {
        console.warn(`Failed to enrich location: ${location.uri}`, error);
        return {
          filePath: location.uri.replace('file://', ''),
          range: location.range,
          text: '',
        };
      }
    })
  );
};
```

## State Management for Notifications

### **Stateful Stores**

```typescript
class WindowLogMessageStore {
  private messages: WindowLogMessage[] = [];
  private readonly maxMessages = 1000;

  addMessage(message: WindowLogMessage): void {
    this.messages.unshift(message);
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(0, this.maxMessages);
    }
  }

  getMessages(): readonly WindowLogMessage[] {
    return [...this.messages];
  }
}

class DiagnosticsStore {
  private diagnosticsByUri = new Map<string, PublishDiagnosticsParams>();

  updateDiagnostics(params: PublishDiagnosticsParams): void {
    this.diagnosticsByUri.set(params.uri, params);
  }

  getDiagnostics(uri: string): PublishDiagnosticsParams | undefined {
    return this.diagnosticsByUri.get(uri);
  }
}
```

### **Notification Handler Setup**

```typescript
const setupNotificationHandlers = (
  client: ILspClient,
  windowLogStore: WindowLogMessageStore,
  diagnosticsStore: DiagnosticsStore
): void => {
  client.onNotification('window/logMessage', (params: LogMessageParams) => {
    const logMessage: WindowLogMessage = {
      timestamp: new Date(),
      level: params.type,
      message: params.message,
      source: 'lsp-server',
    };
    windowLogStore.addMessage(logMessage);
  });

  client.onNotification(
    'textDocument/publishDiagnostics',
    (params: PublishDiagnosticsParams) => {
      diagnosticsStore.updateDiagnostics(params);
    }
  );
};
```

## Configuration Loading

### **Configuration Structure**

```typescript
interface LspProfileConfig {
  name: string;
  command: string;
  args: string[];
  workingDirectory: string;
  preloadFiles?: string[];
  symbolSettings?: {
    maxDepth?: number;
    excludeKinds?: SymbolKind[];
    includeKinds?: SymbolKind[];
  };
  diagnosticsSettings?: {
    strategy: 'pull' | 'push';
    pushTimeoutMs?: number;
  };
}
```

### **Loading from Filesystem**

```typescript
const loadConfiguration = async (
  configPath: string
): Promise<LspProfileConfig> => {
  const configContent = await fs.readFile(configPath, 'utf-8');

  if (configPath.endsWith('.json')) {
    return JSON.parse(configContent);
  } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
    return yaml.parse(configContent);
  }

  throw new Error(`Unsupported config format: ${configPath}`);
};
```

## LSP Request Patterns

### **Sequential vs Parallel Execution**

- **Default**: Sequential execution (most LSP servers prefer this)
- **Parallel**: Only for different request types, and only when tested safe
- **Never parallel**: Same request type with different parameters

```typescript
// Current approach: Sequential for reliability (inside inspectSymbol)
const documentSymbols = await getDocumentSymbolsInternal(client, fileUri);
const clickedSymbol = findSymbolAtPosition(documentSymbols, request.position);
const hover = await getHoverInternal(client, fileUri, request.position);
const definition = await getDefinitionInternal(
  client,
  fileUri,
  request.position
);
const typeDefinition = await getTypeDefinitionInternal(
  client,
  fileUri,
  request.position
);
const implementation = await getImplementationInternal(
  client,
  fileUri,
  request.position
);

// Future optimization: Could parallelize the navigation requests
const [definition, typeDefinition, implementation] = await Promise.all([
  getDefinitionInternal(client, fileUri, request.position),
  getTypeDefinitionInternal(client, fileUri, request.position),
  getImplementationInternal(client, fileUri, request.position),
]);
```

## Error Handling Strategy

### **Structured Error Types**

```typescript
enum ErrorCode {
  WorkspaceLoadInProgress = 'WORKSPACE_LOADING',
  FileNotFound = 'FILE_NOT_FOUND',
  LSPError = 'LSP_ERROR',
  InvalidPosition = 'INVALID_POSITION',
}

interface ApplicationServiceError {
  message: string;
  errorCode: ErrorCode;
  originalError?: Error;
}

type Result<T, E = ApplicationServiceError> =
  | { success: true; data: T }
  | { success: false; error: E };
```

### **Error Handling Pattern**

```typescript
// Each public operation handles its own errors
export const findReferences = async (
  client: ILspClient,
  preloadedFiles: Set<string>,
  request: { filePath: string; position: { line: number; character: number } }
): Promise<Result<SymbolLocation[]>> => {
  return await executeWithFileLifecycle(
    client,
    preloadedFiles,
    request.filePath,
    async (fileUri) => {
      try {
        const lspParams = {
          textDocument: { uri: fileUri },
          position: {
            line: request.position.line - 1,
            character: request.position.character - 1,
          },
          context: { includeDeclaration: true },
        };

        const locations = await client.sendRequest(
          'textDocument/references',
          lspParams
        );
        const enrichedLocations = await enrichWithText(
          convertLocations(locations)
        );

        return { success: true, data: enrichedLocations };
      } catch (error) {
        return {
          success: false,
          error: {
            message: 'Failed to find references',
            code: 'REFERENCES_ERROR',
            originalError:
              error instanceof Error ? error : new Error(String(error)),
          },
        };
      }
    }
  );
};
```

## Implementation Priority

### **Phase 1: Core Infrastructure**

1. ✅ Context creation and configuration loading
2. ✅ Basic LSP client setup
3. ✅ File lifecycle management
4. ✅ Position conversion utilities
5. ✅ Error handling framework

### **Phase 2: Simple Operations**

1. **Initialize** - LSP connection setup
2. **Get Window Log Messages** - Access stored notifications
3. **Get Document Symbols** - Single LSP request with filtering
4. **Get Diagnostics** - State access or pull request

### **Phase 3: Complex Operations**

1. **Find References** - Single LSP request with text enrichment
2. **Search Symbols** - Workspace-wide symbol search
3. **Completion** - Code completion with context

### **Phase 4: Advanced Operations**

1. **Inspect Symbol** - Multi-request orchestration
2. **Rename Symbol** - Workspace edits and file system changes

## Testing Strategy

### **Unit Tests**

- **Pure functions**: Test all public LspOperations with mocked dependencies
- **Internal helpers**: Test position conversion, text enrichment, file lifecycle
- **State stores**: Test notification storage and retrieval independently

### **Integration Tests**

- **Real LSP server**: Test with actual TypeScript language server
- **File operations**: Test file lifecycle with preloaded vs regular files
- **Configuration loading**: Test various config formats (JSON, YAML)

### **End-to-End Tests**

- **MCP server**: Full MCP tool workflow from handler to response formatting
- **Error scenarios**: Network failures, invalid positions, missing files, LSP server crashes

## Key Success Factors

1. **Position conversion accuracy** - Most critical for LSP communication
2. **File lifecycle correctness** - Essential for preloaded files and project context
3. **State management reliability** - Must not lose notifications
4. **Error handling completeness** - Graceful degradation for partial failures
5. **Text enrichment performance** - Fast file reading and text extraction

## Key Architectural Benefits

### **✅ Pure Functional Approach:**

- **No Classes**: Embraces TypeScript functional patterns over OOP
- **Minimal Dependencies**: Functions only receive what they actually need
- **Easy Testing**: Mock only required dependencies, not entire contexts
- **Composable**: Functions can be easily combined and reused
- **Clear Contracts**: Function signatures show exact dependencies

### **✅ Public vs Internal Separation:**

- **Public API**: Only functions that correspond to MCP tools are exported
- **Internal Helpers**: LSP request functions and utilities are private implementation details
- **Better Encapsulation**: Can refactor internals without affecting MCP handlers
- **Realistic Workflow**: `inspectSymbol` handles complete file lifecycle once per tool call

### **✅ Module-Level State:**

- **Familiar Pattern**: Similar to Next.js API routes with persistent connections
- **Efficient**: Language server process stays alive between MCP tool calls
- **Stateful Stores**: Notifications accumulated over time for log and diagnostic tools

This plan provides a solid foundation for implementing a robust, maintainable TypeScript LSP-to-MCP service layer that fully embraces modern TypeScript functional patterns while handling the complexity of LSP protocol orchestration efficiently.
