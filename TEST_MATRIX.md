# Test Matrix

This document tracks the testing status of all MCP tools across different Language Server implementations.

## Test Results Legend

- ✅ **Pass** - Feature works as expected
- ❌ **Fail** - Feature doesn't work or has issues
- ⚠️ **Partial** - Feature works but with limitations

## Test Matrix

| Test Case                                                                                             | TypeScript | C#   | Pyright | Go  | Rust | Java |
| ----------------------------------------------------------------------------------------------------- | ---------- | ---- | ------- | --- | ---- | ---- |
| **`logs`**                                                                                            |            |      |         |     |      |      |
| `logs` work and shows successful initialization                                                       | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| **`search`**                                                                                          |            |      |         |     |      |      |
| `search` tool finds symbol by full name                                                               | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| `search` tool finds symbols with partial name                                                         | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| **`read`**                                                                                            |            |      |         |     |      |      |
| `read` tool with `previewMode: none`                                                                  | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| `read` tool with `previewMode: signature`                                                             | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| `read` tool with `previewMode: expanded` (longer per-symbol snippets)                                  | ❓         | ⚠️\* | ✅      | ❓  | ❓   | ❓   |
| **`inspect`**                                                                                         |            |      |         |     |      |      |
| `inspect` tool returns documentation when available                                                   | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| `inspect` tool returns decompiled location for external symbols                                       | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| `inspect` tool returns symbol paths can be read by read tool                                          | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| **`completion`**                                                                                      |            |      |         |     |      |      |
| `completion` tool returns suggestions                                                                 | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| `completion` tool scopes suggestions to context (e.g. after a dot operator only methods are returned) | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| **`diagnostics`**                                                                                     |            |      |         |     |      |      |
| `diagnostics` tool returns errors/warnings when present                                               | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| `diagnostics` tool shows "no issues" for clean files                                                  | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| **`references`**                                                                                      |            |      |         |     |      |      |
| `references` tool finds references across the codebase                                                | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| References include interface implementations                                                          | ❓         | ✅   | ✅      | ❓  | ❓   | ❓   |
| **`rename`**                                                                                          |            |      |         |     |      |      |
| `rename` tool renames symbol across codebase                                                          | ❓         | ❓   | ❌\*    | ❓  | ❓   | ❓   |

## Notes

**C# Implementation Notes:**

- \*Read previewMode: none already includes the signature without modifiers (public async)
- \*Read previewMode: expanded shows minimal symbol names instead of longer snippets
- Excellent decompilation support for .NET Framework symbols
- Strong type information and documentation extraction
- All core tools working as expected

**Pyright Implementation Notes:**

- \*Rename tool completely non-functional across all scenarios (0 changes reported, no file modifications)
- Excellent LSP integration with large codebases (1129+ files)
- Superior external symbol resolution via typeshed and system Python paths
- Context-aware completion rivals IDE experiences
- Comprehensive diagnostics with detailed type error reporting
- 7/8 tools working at excellent quality level

**Known Issues:**

- TypeScript MCP server had diagnostics strategy configuration issue (fixed)
- C# read tool uses wrong language identifier in code blocks (shows `typescript` instead of `csharp`)
- Pyright rename tool fails silently - MCP server layer issue, not LSP server

## Test Examples Used

### C# Test Cases

- **File**: `.external/lsp-use/src/LspUse.Application/ApplicationService.cs`
- **Search**: "ApplicationService" (found 12 matches across 5 files)
- **Inspect**: Task<T> from System.Threading.Tasks (decompiled successfully)
- **Completion**: After `_logger.` (showed 15 IntelliSense suggestions)
- **Diagnostics**: `PythonLspTests.cs` (found 7 errors, 3 warnings, 1 info)
- **References**: `FindReferencesAsync` method (found 4 references across 3 files)

### Pyright Test Cases

- **File**: `.external/fastapi/fastapi/applications.py` (FastAPI main application class)
- **Search**: "FastAPI" (found 9 matches across 6 files), "Fast" (found 43 matches across 30 files)
- **Inspect**: FastAPI class (comprehensive docs with examples), Enum from stdlib (3 definition locations)
- **Completion**: After `app.` (showed 73 suggestions with proper scoping)
- **Diagnostics**: Created test file (detected 5 errors: import, type, undefined variable issues)
- **References**: `add_api_route` method (found 5 references across 2 files)
- **Rename**: Tested extensively - tool responds but performs no actual changes

### Next Steps

1. Test TypeScript MCP server with same test cases
2. Add Pyright, Go, Rust, and Java LSP configurations
3. Test rename functionality across all implementations
4. Document any language-specific behaviors or limitations

## Configuration Requirements

Each LSP requires proper configuration in the `lsps.yaml` file:

- Command path and arguments
- File extensions mapping
- Diagnostic strategy (push/pull)
- Workspace detection files
