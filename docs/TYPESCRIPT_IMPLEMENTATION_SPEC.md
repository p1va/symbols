# TypeScript Implementation Specification for symbols

This document provides a comprehensive specification for implementing the symbols ApplicationService in TypeScript, based on the existing C# implementation. It describes all the architectural patterns, LSP interactions, error handling, and business logic necessary for a complete port using plain English descriptions rather than code examples.

## Architecture Overview

### Core Components

1. **ApplicationService**: Main orchestrator class that manages LSP operations
2. **LSP Client Interface**: Handles JSON-RPC communication with language servers
3. **Configuration Management**: Handles language server profiles and settings
4. **File Lifecycle Management**: Manages opening/closing files with LSP servers
5. **Error Handling**: Comprehensive error handling with specific error codes
6. **Text Enrichment**: Adds source code text to symbol locations for better UX

### Dependencies

- **JSON-RPC Client**: For LSP communication (similar to StreamJsonRpc in C#)
- **File System**: For file operations and path resolution
- **Logging**: Structured logging for debugging and monitoring
- **Configuration**: YAML/JSON configuration parsing for LSP profiles

## ApplicationService Class Structure

### Fields and Properties

The ApplicationService class should contain:

- Language server configuration (working directory, solution/project paths, profile name)
- Language server manager instance
- Logger for debugging and monitoring
- Language ID mapper to determine file types
- LSP configuration service for profile settings
- Server capabilities object (stored after initialization)
- Set of preloaded files (case-insensitive string comparison)
- Property to access the LSP client instance

### Key Data Types

**LanguageServerConfiguration**: Contains working directory, optional solution path, optional project paths array, and optional profile name.

**EditorPosition**: Contains line and character numbers as 1-based coordinates (user-facing positions).

**ZeroBasedPosition**: Contains line and character numbers as 0-based coordinates (LSP protocol positions).

## Initialization Flow

### 1. InitializeAsync Method

**Purpose**: Establishes LSP connection and configures workspace

**Steps**:

1. Start the language server manager
2. Send LSP `initialize` request with client capabilities
3. Send LSP `initialized` notification
4. Handle workspace setup (C#-specific or generic)
5. Open preload files to maintain project context

**LSP Requests Sent**:

- `initialize` with `InitializeParams`
- `initialized` notification
- `solution/open` (C# specific) or `project/open` (C# specific)

**Client Capabilities to Include**:

```typescript
const clientCapabilities = {
  workspace: {
    diagnostic: null, // Disable workspace diagnostics
  },
  textDocument: {
    publishDiagnostics: {
      relatedInformation: true,
      versionSupport: true,
      codeDescriptionSupport: true,
      dataSupport: true,
    },
    diagnostic: {
      dynamicRegistration: true,
      relatedDocumentSupport: true,
    },
  },
};
```

**C# Workspace Setup**:

```typescript
// If solutionPath provided
await languageServer.notify('solution/open', {
  solution: new URL(`file://${solutionFullPath}`),
});

// If projectPaths provided
await languageServer.notify('project/open', {
  projects: projectPaths.map((p) => new URL(`file://${p}`)),
});
```

### 2. Preload Files Mechanism

**Purpose**: Keep certain files open to maintain project context for LSP servers that need it

**Implementation**:

```typescript
private async openPreloadFilesAsync(cancellationToken: CancellationToken): Promise<void> {
  const profileName = this.config.profileName;
  if (!profileName) return;

  const resolver = await this.lspConfigurationService.createResolverAsync();
  const lspProfile = resolver.getProfile(profileName);

  if (!lspProfile?.preloadFiles?.length) return;

  for (const preloadFile of lspProfile.preloadFiles) {
    try {
      const absolutePath = path.isAbsolute(preloadFile)
        ? preloadFile
        : path.join(this.config.workingDirectory, preloadFile);

      if (!fs.existsSync(absolutePath)) {
        this.logger.warn(`Preload file not found: ${absolutePath}`);
        continue;
      }

      const fileUri = new URL(`file://${absolutePath}`);
      await this.openFileOnLspAsync(fileUri, cancellationToken);
      this.preloadedFiles.add(absolutePath);
    } catch (error) {
      this.logger.error(`Failed to open preload file: ${preloadFile}`, error);
    }
  }
}
```

## Workspace Loading Guards

### IsWorkspaceReady Check

**Implementation**:

```typescript
private isWorkspaceReady(): boolean {
  // Only wait for workspace loading if C# specific files (.sln or .csproj) are provided
  if (!this.isCSharpWorkspace()) {
    return true;
  }

  // If the handler is not present we assume the workspace does not need
  // to signal readiness (non-Roslyn LS) and therefore treat it as ready.
  return this.manager.client.workspace.workspaceInitialization.isCompleted;
}

private isCSharpWorkspace(): boolean {
  return !!(this.config.solutionPath || this.config.projectPaths?.length);
}
```

**Error Response When Not Ready**:

```typescript
private static workspaceLoadingError(): ApplicationServiceError {
  return {
    message: "Workspace is still loading",
    errorCode: ErrorCode.WorkspaceLoadInProgress
  };
}
```

## File Lifecycle Management

### ExecuteWithFileLifecycleAsync Pattern

**Purpose**: Ensures files are properly opened/closed for LSP operations while handling preloaded files specially

**Implementation**:

```typescript
private async executeWithFileLifecycleAsync<T>(
  filePath: string,
  operation: (fileUri: URL) => Promise<T>,
  cancellationToken: CancellationToken
): Promise<T> {
  // Ensure file exists and get its absolute URI
  this.ensureFileExists(filePath, out absoluteFileUri);

  const isPreloadedFile = this.preloadedFiles.has(absoluteFileUri.pathname);

  if (isPreloadedFile) {
    // For preloaded files, use didChange pattern to signal activity
    try {
      // Signal file activity with didChange (empty change)
      await this.languageServer.notify("textDocument/didChange", {
        textDocument: {
          uri: absoluteFileUri.toString(),
          version: 1
        },
        contentChanges: []
      });

      // Close and reopen to ensure fresh state
      await this.closeFileOnLspAsync(absoluteFileUri, cancellationToken);
      await this.openFileOnLspAsync(absoluteFileUri, cancellationToken);

      // Perform operation
      return await operation(absoluteFileUri);
    } finally {
      // Reopen the preloaded file to maintain project context
      await this.openFileOnLspAsync(absoluteFileUri, cancellationToken);
    }
  } else {
    // Standard file lifecycle for non-preloaded files
    await this.openFileOnLspAsync(absoluteFileUri, cancellationToken);
    try {
      return await operation(absoluteFileUri);
    } finally {
      await this.closeFileOnLspAsync(absoluteFileUri, cancellationToken);
    }
  }
}
```

### File Operations

```typescript
private async openFileOnLspAsync(fileUri: URL, cancellationToken: CancellationToken): Promise<void> {
  const content = await fs.promises.readFile(fileUri.pathname, 'utf8');

  await this.languageServer.didOpen({
    textDocument: {
      version: 1,
      uri: fileUri.toString(),
      languageId: this.languageIdMapper.mapFileToLanguageId(fileUri.pathname),
      text: content
    }
  }, cancellationToken);
}

private async closeFileOnLspAsync(fileUri: URL, cancellationToken: CancellationToken): Promise<void> {
  await this.languageServer.didClose({
    textDocument: {
      uri: fileUri.toString()
    }
  }, cancellationToken);
}
```

## Position Conversion Utilities

**Critical Implementation Detail**: All user-facing positions are 1-based, but LSP protocol uses 0-based positions.

```typescript
interface EditorPosition {
  line: number; // 1-based
  character: number; // 1-based
}

interface LSPPosition {
  line: number; // 0-based
  character: number; // 0-based
}

function toZeroBased(editorPos: EditorPosition): LSPPosition {
  return {
    line: editorPos.line - 1,
    character: editorPos.character - 1,
  };
}

function toOneBased(lspPos: LSPPosition): EditorPosition {
  return {
    line: lspPos.line + 1,
    character: lspPos.character + 1,
  };
}
```

## MCP Tool Implementation Specifications

### 1. InspectAsync (Comprehensive Symbol Inspection)

**Purpose**: Provides comprehensive symbol inspection combining hover documentation and all navigation results (definition, type definition, implementation) in one unified view

**MCP Layer Implementation Pattern**: The InspectTool at the MCP layer orchestrates multiple ApplicationService calls and formats the results into text blocks for display. This is implemented at the MCP server layer, not in ApplicationService.

**Orchestration Logic**:

1. **Initial Setup**: Create a GoToRequest with the file path and position (line, character as 1-based coordinates)
2. **Collect Navigation Data**: Make parallel calls to gather all navigation information:
   - Call `GoToDefinitionAsync` to get symbol definitions and extract symbol name and debug context
   - Call `HoverAsync` to get documentation/type information
   - Call `GoToTypeDefinitionAsync` to get type definitions
   - Call `GoToImplementationAsync` to get interface/abstract implementations
3. **Error Handling**: Each call is wrapped in try-catch, logging warnings for failures but continuing with other operations
4. **Result Consolidation**: Combine all results into formatted text blocks:
   - **Context Block**: Always present, shows symbol name, file location, position, and cursor context
   - **Documentation Block**: Only if hover content exists, shows symbol documentation
   - **Navigation Blocks**: Only if results exist, shows definitions, type definitions, and implementations separately

**Individual ApplicationService Methods Used**:

**GoToDefinitionAsync**:

- **LSP Request**: `textDocument/definition`
- **Logic**: Check workspace ready, execute with file lifecycle, call LSP definition request with zero-based position, convert locations to symbol locations, enrich with text, get cursor info, return success with locations and cursor info

**GoToTypeDefinitionAsync**:

- **LSP Request**: `textDocument/typeDefinition`
- **Logic**: Same pattern as GoToDefinitionAsync but uses type definition LSP request

**GoToImplementationAsync**:

- **LSP Request**: `textDocument/implementation`
- **Logic**: Same pattern as GoToDefinitionAsync but uses implementation LSP request

**HoverAsync**:

- **LSP Requests**: `textDocument/documentSymbol` (to find clicked symbol), then `textDocument/hover`
- **Logic**: Check workspace ready, ensure file exists, open file, get document symbols to find what was clicked, get hover information, get cursor info, close file, return hover content with clicked symbol and cursor info

### 2. FindReferencesAsync

**Purpose**: Find all references to a symbol in the codebase

**LSP Request**: `textDocument/references`

**Logic**: Check workspace ready, execute with file lifecycle, call LSP references request with zero-based position and include declaration context, convert to symbol locations, enrich with text, return success with locations

### 3. CompletionAsync

**Purpose**: Get code completion suggestions at a specific position

**LSP Request**: `textDocument/completion`

**Logic**: Check workspace ready, get cursor context for debugging, execute with file lifecycle, call LSP completion request with zero-based position, return completion items with incomplete flag and debug context

### 4. SearchSymbolAsync

**Purpose**: Search for symbols across the entire workspace

**LSP Request**: `workspace/symbol`

**Logic**: Check workspace ready, call LSP workspace symbol request with query string, convert matching symbols to document symbols (extracting name, kind, container name, location), extract locations and enrich with text, create lookup map by location key, update symbols with enriched locations, return success with enriched symbols

### 5. GetDocumentSymbolsAsync

**Purpose**: Get all symbols in a specific document

**LSP Request**: `textDocument/documentSymbol`

**Logic**: Check workspace ready, get symbol filtering settings from LSP profile, execute with file lifecycle, call LSP document symbol request, convert symbols to document symbols format, extract and enrich locations with text, create lookup map, update symbols with enriched locations, apply symbol filtering based on settings, calculate symbol depths for hierarchical display, return success with processed symbols

### 6. GetDocumentDiagnosticsAsync

**Purpose**: Get diagnostics (errors, warnings, hints) for a document

**LSP Requests**:

- `textDocument/diagnostic` (pull diagnostics)
- Or wait for `textDocument/publishDiagnostics` notifications (push diagnostics)

**Diagnostic Strategies**:

1. **Pull Diagnostics**: Request diagnostics on-demand via `textDocument/diagnostic`
2. **Push Diagnostics**: Wait for diagnostics via `textDocument/publishDiagnostics` notifications

**Logic**: Check workspace ready, determine diagnostic strategy from LSP profile settings, execute with file lifecycle, switch on strategy (pull or push), convert diagnostics to document diagnostics format, enrich with text content, sort by severity order then line number, return sorted diagnostics

**Pull Diagnostics Logic**: Create empty diagnostics list and provider IDs list, check server capabilities for diagnostic providers (like Pyright), check for dynamic registration providers (like C#), fetch diagnostics for each provider using textDocument/diagnostic request with identifier, aggregate all results

**Push Diagnostics Logic**: Normalize file URI for consistent comparison, wait for specified timeout duration for push notifications to arrive, find diagnostics by URI from latest diagnostics cache, return found diagnostics or empty array

### 7. RenameSymbolAsync

**Purpose**: Rename a symbol across the entire codebase

**LSP Request**: `textDocument/rename`

**Logic**: Check workspace ready, execute with file lifecycle, call LSP rename request with zero-based position and new name, handle null workspace edit by returning failure, create WorkspaceEditApplicator instance, apply workspace edit to file system, return success or failure result with statistics (changed files, total edits applied, total files changed, total lines changed)

### 8. GetWindowLogMessagesAsync

**Purpose**: Get LSP server status messages and logs

**Logic**: Access window log messages from language server manager client, map messages to include message text and message type, return success with log messages array, handle any errors with failure response

## Text Enrichment System

**Purpose**: Add actual source code text to symbol locations for better UX in MCP tools

**Logic**: For each symbol location, read the file content and split into lines. Convert 1-based positions to 0-based array indices. For single line locations, extract substring from start character to end character. For multi-line locations, extract first line from start character to end, middle lines entirely, and last line from beginning to end character. Join multi-line extracts with newlines. Trim whitespace and add to enriched location. If file read fails, add location with empty text and log warning.

## WorkspaceEdit Application

**Purpose**: Apply LSP workspace edits to the file system for rename operations

**Main Logic**: Initialize result object with success status and counters. Check if workspace edit contains changes, return early if none. Process document changes (preferred) or legacy changes format. For each document change, apply edits and merge results. Set final success status based on whether errors occurred.

**Document Change Application**: Extract file URI and path from document change. Read current file content. Sort edits in reverse order (end to start) to avoid offset calculation issues when applying multiple edits. Apply each edit to the content sequentially. Write modified content back to file. Calculate lines changed statistics.

**Text Edit Application**: Split content into lines array. For single-line edits, replace substring between start and end characters with new text. For multi-line edits, extract text before start position and after end position, remove lines in between, split new text into lines, merge with before/after text, and insert back into lines array. Join lines back into content string.

**Lines Changed Calculation**: For each edit, calculate old lines count (end line minus start line plus one) and new lines count (split new text by newlines). Sum absolute differences across all edits.

## Error Handling Patterns

### Error Types

**ErrorCode Enumeration**: Define standard error codes including WorkspaceLoadInProgress, FileNotFound, LSPError, InvalidPosition.

**ApplicationServiceError Interface**: Contains user-friendly message string, optional error code, and optional exception object.

### Common Error Handling Pattern

**Standard Pattern**: Wrap LSP operations in try-catch blocks. Log errors with method name and description. Return ApplicationServiceError object with user-friendly message and original exception for debugging.

## Configuration and LSP Profiles

### Profile Structure

**LspProfile Interface**: Contains profile name, command to execute, command arguments array, optional preload files array, optional symbols settings, and optional diagnostics settings.

**SymbolsSettings Interface**: Contains optional maximum depth for symbol hierarchy, optional array of symbol kinds to exclude, and optional array of symbol kinds to include.

**DiagnosticsSettings Interface**: Contains strategy enumeration (pull or push) and wait timeout in milliseconds for push diagnostics.

## Utility Functions

### Symbol Finding and Context

**Find Symbol at Position**: Iterate through document symbols array, check if editor position falls within each symbol's location range using position-in-symbol logic, return first matching symbol or null.

**Is Position in Symbol**: Check if position line is within symbol's start and end lines. For start line, ensure position character is at or after symbol start character. For end line, ensure position character is at or before symbol end character. Return true if position is within bounds.

**Get Cursor Info**: Read file content and split into lines. Convert editor position to zero-based array index. Validate line and character indices are within bounds. Extract symbol at cursor position. Return cursor info object with line text, symbol at position, and relative file path. Handle errors by logging warning and returning empty cursor info.

**Extract Symbol at Position**: Starting from cursor position, expand backwards and forwards while characters match symbol character pattern (alphanumeric and underscore). Return extracted symbol string.

**Is Symbol Character**: Test character against regex pattern for alphanumeric characters and underscore.

## Key Implementation Notes

1. **Position Conversion**: Always convert between 1-based (user) and 0-based (LSP) coordinates
2. **File Lifecycle**: Use the ExecuteWithFileLifecycleAsync pattern for all file operations
3. **Preloaded Files**: Handle preloaded files differently to maintain project context
4. **Error Handling**: Comprehensive error handling with structured logging
5. **Text Enrichment**: Add source code text to all symbol locations for better UX
6. **Workspace Loading**: Always check workspace readiness before LSP operations
7. **Diagnostic Strategies**: Support both pull and push diagnostic approaches
8. **Symbol Depth Calculation**: Calculate hierarchical depths for symbol display
9. **URI Normalization**: Normalize file URIs for consistent comparison
10. **Atomic Operations**: Ensure file edits are applied atomically with proper error handling

This specification provides all the necessary details to implement a complete TypeScript port of the C# ApplicationService while maintaining the same functionality and architectural patterns.
