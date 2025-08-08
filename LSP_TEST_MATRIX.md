# LSP MCP Server Test Matrix

This document tracks the testing status of all MCP tools across different Language Server implementations.

## Test Results Legend
- ✅ **Pass** - Feature works as expected
- ❌ **Fail** - Feature doesn't work or has issues
- ⚠️ **Partial** - Feature works but with limitations
- ❓ **Unknown** - Not yet tested
- 🚫 **N/A** - Feature not applicable/supported

## Test Matrix

| Test Case | TypeScript | C# | Pyright | Go | Rust | Java |
|-----------|------------|----|---------|----|------|------|
| **Startup & Logs** | | | | | | |
| LSP server starts successfully | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| Logs show successful initialization | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| **Search Tool** | | | | | | |
| Search finds symbol by full name | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| Search finds symbols with partial name | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| **Read Tool** | | | | | | |
| Read with previewMode: none | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| Read with previewMode: signature | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| Read with previewMode: full (complete code blocks) | ❓ | ⚠️* | ❓ | ❓ | ❓ | ❓ |
| **Inspect Tool** | | | | | | |
| Inspect returns documentation | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| Inspect returns decompiled location for external symbols | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| External symbol paths can be read by read tool | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| **Completion Tool** | | | | | | |
| Completion works and returns suggestions | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| Context-aware completions (after dot operator) | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| **Diagnostics Tool** | | | | | | |
| Diagnostics return errors/warnings when present | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| Diagnostics show "no issues" for clean files | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| **References Tool** | | | | | | |
| Find references works and shows all usages | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| References include interface implementations | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ |
| **Rename Tool** | | | | | | |
| Rename symbol across codebase | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |
| Rename preserves references and implementations | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |

## Notes

**C# Implementation Notes:**
- *Read previewMode: full shows minimal symbol names instead of complete code blocks
- Excellent decompilation support for .NET Framework symbols
- Strong type information and documentation extraction
- All core tools working as expected

**Known Issues:**
- TypeScript MCP server had diagnostics strategy configuration issue (fixed)
- C# read tool uses wrong language identifier in code blocks (shows `typescript` instead of `csharp`)

## Test Examples Used

### C# Test Cases
- **File**: `.external/lsp-use/src/LspUse.Application/ApplicationService.cs`
- **Search**: "ApplicationService" (found 12 matches across 5 files)
- **Inspect**: Task<T> from System.Threading.Tasks (decompiled successfully)
- **Completion**: After `_logger.` (showed 15 IntelliSense suggestions)
- **Diagnostics**: `PythonLspTests.cs` (found 7 errors, 3 warnings, 1 info)
- **References**: `FindReferencesAsync` method (found 4 references across 3 files)

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