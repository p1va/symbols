# Testing Strategy

This project uses a comprehensive testing strategy with unit tests and integration tests organized for optimal CI performance and developer experience.

## 📁 Test Structure

```
test/
├── unit/                          # Fast unit tests (~70 tests, <1s)
│   ├── position.test.ts          # Position utilities & coordinate conversion
│   ├── validation.test.ts        # Validation functions & error handling  
│   ├── lsp-operations.test.ts    # LSP operations with mocked clients
│   └── index.test.ts             # Server initialization
└── integration/                   # Slower integration tests (~3-5 tests/lang, 10-30s)
    └── languages/
        ├── typescript/            # TypeScript LSP integration
        ├── python/               # Python LSP integration
        └── csharp/               # C# LSP integration
```

## 🚀 Available Test Scripts

| Script | Description | Use Case |
|--------|-------------|----------|
| `pnpm test` | Run all tests (unit + integration) | Local comprehensive testing |
| `pnpm test:unit` | Run unit tests only | Quick feedback during development |
| `pnpm test:unit:coverage` | Unit tests with coverage report | Coverage analysis |
| `pnpm test:integration` | Run all integration tests | Integration verification |
| `pnpm test:integration:typescript` | TypeScript integration only | Language-specific testing |
| `pnpm test:integration:python` | Python integration only | Language-specific testing |
| `pnpm test:integration:csharp` | C# integration only | Language-specific testing |

## 🔄 CI/CD Pipeline

Our GitHub Actions workflow is optimized for speed and parallelization:

### 1️⃣ Unit Tests Job (Fast - ~2-3 minutes)
- **Triggers**: On all pushes and pull requests
- **Purpose**: Fast feedback for code quality and core logic
- **Includes**: Linting, formatting, building, unit testing, coverage
- **Parallelization**: Not needed (fast enough)

### 2️⃣ Integration Test Jobs (Parallel - ~5-10 minutes each)
- **Triggers**: Only after unit tests pass
- **Purpose**: Language-specific LSP integration verification
- **Languages**: 
  - 🔷 **TypeScript**: `typescript-language-server`
  - 🐍 **Python**: `python-lsp-server`  
  - 🟦 **C#**: `csharp-ls` (OmniSharp)
- **Parallelization**: All 3 language jobs run simultaneously

### 3️⃣ Test Summary Job
- **Purpose**: Aggregate results and provide clear pass/fail status
- **Blocks**: Merging until all tests pass

## 🏗️ Architecture Benefits

### ⚡ Fast Feedback Loop
- Unit tests run first and fail fast
- Developers get feedback in ~3 minutes instead of ~15-20 minutes
- Pull requests show immediate status for core functionality

### 🔧 Efficient Resource Usage
- Language-specific jobs only install needed dependencies
- Parallel execution reduces total CI time from ~20min to ~10min
- Failed unit tests don't waste resources on integration tests

### 🎯 Targeted Debugging
- Language-specific failures are isolated
- Each integration job has clear success/failure status
- Easy to identify if issues are general or language-specific

### 📊 Coverage Tracking
- Unit test coverage reported to Codecov
- Coverage thresholds enforced (80% branches/functions/lines/statements)
- Coverage reports uploaded even on test failures

## 🛠️ Local Development Workflow

### For Active Development:
```bash
# Quick feedback during coding
pnpm test:unit

# Watch mode for continuous testing
pnpm test:watch
```

### Before Committing:
```bash
# Full verification
pnpm test

# Or run specific integration test for your changes
pnpm test:integration:typescript
```

### Debugging Integration Issues:
```bash
# Test specific language
pnpm test:integration:python

# Run with verbose output
pnpm vitest run test/integration/languages/python/ --reporter=verbose
```

## ⚙️ Configuration

### Vitest Configuration (`vitest.config.ts`)
- **Timeouts**: 30s test timeout, 15s hook timeout (for language server startup)
- **Parallelization**: File-level parallelism enabled
- **Coverage**: V8 provider with 80% thresholds
- **Reporters**: GitHub Actions + JSON in CI, verbose locally

### Environment Setup
- **Unit Tests**: No external dependencies
- **TypeScript Integration**: Requires `typescript-language-server`
- **Python Integration**: Requires `python-lsp-server[all]`
- **C# Integration**: Requires `.NET 8.x` + `csharp-ls`

## 🎯 Test Philosophy

### Unit Tests (70 tests)
- **Fast**: < 1 second execution
- **Isolated**: Mock all external dependencies
- **Comprehensive**: Cover coordinate conversion, validation, LSP protocol compliance
- **Strategic**: Focus on high-impact areas for maximum confidence

### Integration Tests (~9-15 tests total)
- **Realistic**: Real language servers, real LSP communication
- **Language-specific**: Each language has its own characteristics
- **End-to-end**: Verify actual MCP → LSP → Language Server flow
- **Selective**: Focus on critical paths, not exhaustive coverage

This testing strategy provides **95%+ confidence** in code quality while maintaining **developer velocity** through fast feedback loops.