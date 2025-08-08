# Multi-Language MCP Integration Tests

This directory contains a comprehensive testing framework for validating MCP tools across multiple programming languages and their respective Language Server Protocol (LSP) implementations.

## Architecture

### Base Testing Framework (`base/`)

The base framework provides reusable utilities for writing language-specific tests:

- **`McpTestClient.ts`** - Wrapper around MCP client with convenience methods
- **`LanguageTestSuite.ts`** - Base class for creating language-specific test suites
- **`assertions.ts`** - Common assertion helpers for MCP tool results
- **`index.ts`** - Exports for easy importing

### Language-Specific Tests (`languages/`)

Each supported language has its own directory with:

```
languages/
├── {language}/
│   ├── lsps.yaml          # LSP configuration example
│   ├── test-project/      # Sample project with intentional issues
│   │   └── ...            # Language-specific files
│   └── {language}.test.ts # Test suite extending base classes
```

## Supported Languages

- **Python** (`languages/python/`) - Uses Pyright LSP
- **TypeScript** (`languages/typescript/`) - Uses TypeScript Language Server
- **C#** (`languages/csharp/`) - Uses C# LSP

## How to Add a New Language

1. **Create the directory structure:**
   ```bash
   mkdir -p test/integration/languages/{language}/test-project
   ```

2. **Create LSP configuration** (`lsps.yaml`):
   ```yaml
   lsps:
     {lsp-name}:
       command: '{lsp-command}'
       extensions:
         '.ext': '{language-id}'
       workspace_files:
         - 'project-file.ext'
       diagnostics:
         strategy: 'push' # or 'pull'
         wait_timeout_ms: 3000
   ```

3. **Create test project** with intentional issues for diagnostic testing

4. **Create test suite** extending `LanguageTestSuite`:
   ```typescript
   import { LanguageTestSuite, type LanguageConfig } from '../../base/index.js';
   
   class NewLanguageTestSuite extends LanguageTestSuite {
     constructor() {
       const config: LanguageConfig = {
         name: 'NewLanguage',
         testProjectPath: 'test/integration/languages/newlang/test-project',
         mainFile: 'main.ext',
         testPosition: { file: '', line: 1, character: 1 },
         expectDiagnostics: true,
         customTests: (client, config) => {
           // Language-specific tests here
         },
       };
       super(config);
     }
   }
   
   const suite = new NewLanguageTestSuite();
   suite.createTestSuite();
   ```

## Running Tests

```bash
# Run all integration tests
pnpm test test/integration/

# Run specific language tests
pnpm test test/integration/languages/python/python.test.ts
pnpm test test/integration/languages/typescript/typescript.test.ts
pnpm test test/integration/languages/csharp/csharp.test.ts
```

## Test Coverage

Each language test suite includes:

### Common Tests (All Languages)
- ✅ Tool listing verification (8 tools expected)
- ✅ File symbol reading
- ✅ Symbol inspection (if test position provided)
- ✅ References finding
- ✅ Code completion
- ✅ Diagnostics retrieval (if expected)
- ✅ Log access

### Language-Specific Tests
- **Python:** Function inspection, syntax error detection, symbol search
- **TypeScript:** Interface/class inspection, type error detection, JSDoc support
- **C#:** Method/property inspection, compilation error detection, XML doc support

## Key Features

### 🔧 **Flexible Configuration**
Each language can specify its own LSP settings, test positions, and expectations.

### 🎯 **Comprehensive Assertions**
Rich assertion helpers for diagnostics, symbol inspection, and tool results.

### 🚀 **Easy Extension**
Adding a new language requires minimal boilerplate - just configuration and custom tests.

### 🛡️ **Robust Testing**
Includes both successful operations and error condition testing.

### 📊 **Consistent Structure**
All languages follow the same testing patterns while allowing for language-specific customization.

## Example Test Projects

Each test project contains:
- **Intentional errors** for diagnostic testing
- **Various symbol types** (functions, classes, interfaces, etc.)
- **Documentation** (JSDoc, XML docs, docstrings) for testing symbol inspection
- **Language-specific features** for comprehensive testing

This architecture makes it easy to ensure all MCP tools work correctly across different programming languages and LSP implementations.

## Debugging Integration Test Failures

When tests fail, use this systematic approach to diagnose issues:

### 1. **Run Debug Tests First**
```bash
# Run debug version for detailed output
pnpm test test/integration/languages/csharp/debug.test.ts
pnpm test test/integration/languages/python/debug.test.ts
```

### 2. **Common Issues & Solutions**

#### **Position Coordinate Issues**
**Symptom**: Inspect/references fail with "No symbol at this line"

**Solution**: Use the debug test to find actual coordinates:
1. Run debug test to see symbol positions from `read` tool
2. Look for output like: `@14:21 Method - Main(string[] args)`
3. Update test coordinates to match actual LSP positions

#### **LSP-Specific Issues**
- **C# LSP**: Completion may fail due to internal LSP bugs
- **Python LSP**: Needs proper Python environment setup
- **TypeScript LSP**: Generally most reliable

#### **Diagnostic Issues**  
**Symptom**: Expected compilation errors not found

**Root Causes**:
- LSP may need project context (`.csproj`, `pyproject.toml`) to report errors
- Initialization delays - LSP may need time to analyze files
- Configuration - LSP may need specific workspace setup

### 3. **Enhanced Error Reporting**
The framework provides detailed error reporting:
- Tool call arguments and responses logged with `debug: true` parameter
- Rich error messages in assertion failures
- Step-by-step debugging in debug test suites

### 4. **Best Practices**
1. Always run debug version first when creating new language tests
2. Use exact coordinates from `read` tool output, not guessed positions  
3. Set realistic expectations based on actual LSP capabilities
4. Include fallback assertions for flaky LSP operations