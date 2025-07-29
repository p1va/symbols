# MCP TypeScript Language Server Implementation Understanding

## Overview

This document synthesizes my understanding of what we need to build: **An MCP server that provides TypeScript language intelligence tools by orchestrating LSP requests internally and presenting formatted results to Claude Code**.

The goal is to build 8 core tools that help Claude Code navigate and understand TypeScript codebases more effectively.

## Architecture Summary

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Claude Code   │◄──►│   MCP Server     │◄──►│ TypeScript LSP      │
│                 │    │  (8 tools)       │    │ Language Server     │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

**Key Components:**

- **MCP Server Layer**: Exposes 8 tools, handles formatting for Claude Code
- **ApplicationService Layer**: Core LSP orchestration logic
- **LSP Communication**: Direct JSON-RPC with TypeScript language server
- **File Lifecycle Management**: Smart file opening/closing with preload support
- **Text Enrichment**: Adds source code snippets to symbol locations

## Core Implementation Insights

### 1. **Position Coordinate System**

- **User/MCP Interface**: 1-based coordinates (line 1, character 1)
- **LSP Protocol**: 0-based coordinates (line 0, character 0)
- **Critical**: Always convert between systems correctly

### 2. **File Lifecycle Pattern**

The spec reveals a sophisticated file management system:

```typescript
// Simplified pattern from spec
executeWithFileLifecycle(filePath, async (fileUri) => {
  // For preloaded files: signal activity, close, reopen, operate, reopen
  // For regular files: open, operate, close
  return await lspOperation(fileUri);
});
```

**Why this matters**: Some language servers (especially C#/Roslyn) need certain files to stay open for project context.

### 3. **Text Enrichment Strategy**

Each symbol location gets enriched with actual source code text:

- Single line: extract substring
- Multi-line: extract first line, middle lines, last line
- **Result**: Claude Code sees both location AND the actual code

## The 8 MCP Tools We Need to Build

Based on my testing of the existing MCP TypeScript tools and the spec analysis:

### 1. **Initialize**

**Purpose**: Set up LSP connection and workspace
**MCP Layer**: Simple tool that calls ApplicationService.InitializeAsync()
**LSP Calls**: `initialize`, `initialized`, optional `solution/open` or `project/open`
**Output**: Success/failure status with server capabilities

### 2. **Get LSP Windows Logs**

**Purpose**: Access language server status and debug messages  
**MCP Layer**: Calls ApplicationService.GetWindowLogMessagesAsync()
**Current MCP Output Example**:

```
Found 1 log message: 1 info
[INFO] Using Typescript version (workspace) 5.8.3 from path "..."
```

**LSP Source**: Window log message notifications collected over time

### 3. **Completion**

**Purpose**: Get code completion suggestions at cursor position
**MCP Layer**: Calls ApplicationService.CompletionAsync()
**Current MCP Output Example**:

```
Found 0 completions in file: playground/dotnet.ts
  Cursor @1:10
  /**|
No completions found
```

**LSP Call**: `textDocument/completion`
**Enhancement**: Should show available completions with types and documentation

### 4. **Inspect a Symbol**

**Purpose**: Comprehensive symbol information (hover + all navigation)
**MCP Layer**: Orchestrates multiple ApplicationService calls:

- `GoToDefinitionAsync()`
- `HoverAsync()`
- `GoToTypeDefinitionAsync()`
- `GoToImplementationAsync()`

**Current MCP Output Example**:

````
Inspecting symbol 'cp' in file: playground/dotnet.ts
    Position: @19:15
    Cursor: import * as cp| from 'chi
Documentation for 'cp':
```typescript
(alias) module "child_process"
import cp
````

[Detailed documentation...]

Found 1 definitions for 'cp':
node_modules/.pnpm/@types+node@24.1.0/node_modules/@types/node/child_process.d.ts:68:16
Code: declare module "child_process" {

```

**LSP Calls**: `textDocument/definition`, `textDocument/hover`, `textDocument/typeDefinition`, `textDocument/implementation`

### 5. **Find Symbol References**
**Purpose**: Find all uses of a symbol across the codebase
**MCP Layer**: Calls ApplicationService.FindReferencesAsync()
**Current MCP Output Example**:
```

Found 2 references for symbol at playground/dotnet.ts:19:15 across 1 file:
playground/dotnet.ts (2 references)
19:13 - import \* as cp from 'child_process';
42:27 - const serverProcess = cp.spawn('typescript-language-server', ['--stdio']);

```
**LSP Call**: `textDocument/references`
**Enhancement**: Should include enriched text snippets for each reference

### 6. **Rename Symbol**
**Purpose**: Rename symbol across entire codebase
**MCP Layer**: Calls ApplicationService.RenameSymbolAsync()
**LSP Call**: `textDocument/rename`
**Output**: Should show statistics (files changed, edits applied, lines changed)

### 7. **Search Symbols**
**Purpose**: Search for symbols by name across workspace
**MCP Layer**: Calls ApplicationService.SearchSymbolAsync()
**Current Status**: MCP tool had an error - needs investigation
**LSP Call**: `workspace/symbol`
**Expected Output**: List of matching symbols with locations and enriched text

### 8. **Get Document Symbols**
**Purpose**: Get all symbols in a specific file
**MCP Layer**: Calls ApplicationService.GetDocumentSymbolsAsync()
**Current MCP Output Example**:
```

Found 1 symbol in file: playground/dotnet.ts
Symbol breakdown: 1 function
runCli (Function) @38:1

```
**LSP Call**: `textDocument/documentSymbol`
**Enhancement**: Should show hierarchical structure with depths

### 9. **Get Diagnostics**
**Purpose**: Get errors, warnings, hints for a file
**MCP Layer**: Calls ApplicationService.GetDocumentDiagnosticsAsync()
**Current MCP Output Example**:
```

Found 6 diagnostics in playground/dotnet.ts:
2 Errors
4 Hints
Errors (2):
@45:8-28 Argument of type 'Readable' is not assignable to parameter of type 'MessageReader'.
Rule: 2345

````
**LSP Calls**: `textDocument/diagnostic` (pull) or wait for `textDocument/publishDiagnostics` (push)

## Key Technical Insights from Spec Analysis

### 1. **Workspace Loading Guards**
For C# projects (and potentially others), we need to wait for workspace initialization:
```typescript
private isWorkspaceReady(): boolean {
  if (!this.isCSharpWorkspace()) return true;
  return this.manager.client.workspace.workspaceInitialization.isCompleted;
}
````

### 2. **Preload Files Strategy**

Some language servers need specific files to stay open for project context:

- Configuration files
- Entry points
- Key type definition files

### 3. **Diagnostic Strategies**

The spec reveals two approaches:

- **Pull**: Request diagnostics on-demand
- **Push**: Wait for server notifications
- Decision based on LSP profile configuration

### 4. **Symbol Filtering and Depth**

Document symbols can be filtered by:

- Symbol kinds (class, function, variable, etc.)
- Maximum depth for hierarchical display
- Include/exclude lists

## Implementation Priority & Complexity

**Phase 1 (Core):**

1. Initialize ✅ (Simple)
2. Get Diagnostics ✅ (Medium - two strategies)
3. Get Document Symbols ✅ (Medium - filtering logic)

**Phase 2 (Navigation):** 4. Inspect Symbol 🔄 (Complex - orchestrates multiple calls) 5. Find References ✅ (Medium) 6. Search Symbols ❌ (Medium - needs debugging)

**Phase 3 (Advanced):**  
7. Completion ✅ (Medium - formatting) 8. Rename Symbol (Complex - workspace edits) 9. Get LSP Logs ✅ (Simple)

## Missing Pieces for Production

1. **Configuration System**: LSP profiles with preload files, symbol settings, diagnostic strategies
2. **Error Handling**: Structured error codes and user-friendly messages
3. **Workspace Edit Application**: File system modification for rename operations
4. **Language ID Mapping**: Determine file types for `textDocument/didOpen`
5. **URI Normalization**: Consistent file URI handling across platforms

## Testing Strategy

The current playground demonstrates the core LSP communication patterns. For MCP server development, we should:

1. **Unit Tests**: Each ApplicationService method with mocked LSP client
2. **Integration Tests**: Real LSP server communication
3. **MCP Tool Tests**: End-to-end MCP server functionality
4. **Position Conversion Tests**: Critical 1-based ↔ 0-based conversion logic

## Conclusion

The spec provides a comprehensive blueprint for a sophisticated LSP-to-MCP bridge. The existing MCP TypeScript tools show the desired output format. The main implementation challenge is orchestrating multiple LSP calls and presenting the results in a format that helps Claude Code understand and navigate TypeScript codebases effectively.

The file lifecycle management and text enrichment systems are key differentiators that will make this MCP server more useful than raw LSP access.
