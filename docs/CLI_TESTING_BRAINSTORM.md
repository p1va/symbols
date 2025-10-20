# CLI Testing Brainstorm

## Current State

The CLI parsing logic in `src/utils/cli.ts` has ~700 lines of complex argument parsing with:
- 3 main commands: `start`, `run`, `config`
- Complex `run` command logic that handles LSP commands with/without `--` delimiter
- Flag parsing with `=` syntax, boolean flags, and value flags
- Subcommands for `config` (init, show, path)

**Current test coverage**: ❌ None

## Is Unit Testing Possible?

### ✅ YES - Here's why:

1. **Accepts args parameter**: The main function signature is:
   ```typescript
   export function parseCliArgs(args: string[] = process.argv): CliArgs
   ```
   This means we can pass in mock arguments instead of relying on `process.argv`!

2. **Pure parsing logic**: Most of the function is pure - it takes strings and returns objects

3. **Existing test infrastructure**: The project uses `vitest` with tests in `test/unit/`

## Testing Challenges & Solutions

### Challenge 1: File System Dependencies

**Problem**: Line 224 calls `listAvailableLsps(argv.config)` which reads config files

**Solutions**:

#### Option A: Mock the dependency (easiest, test current code as-is)
```typescript
import { vi, describe, it, expect } from 'vitest';
import * as lspConfig from '../../src/config/lsp-config.js';

vi.mock('../../src/config/lsp-config.js', () => ({
  listAvailableLsps: vi.fn(() => ['typescript', 'python']),
  loadLspConfig: vi.fn(() => ({ config: {}, source: 'test' })),
}));
```

#### Option B: Make dependencies injectable (more refactoring)
```typescript
export function parseCliArgs(
  args: string[] = process.argv,
  deps = { listAvailableLsps, loadLspConfig }
): CliArgs {
  // Use deps.listAvailableLsps() instead of direct import
}
```

#### Option C: Extract validation logic (functional approach, aligns with CLAUDE.md)
```typescript
// Pure parsing - no I/O
export function parseCliArgs(args: string[]): CliArgs {
  // ... parsing only
}

// Separate validation with I/O
export function validateCliArgs(args: CliArgs): Result<CliArgs, Error> {
  // ... call listAvailableLsps here
}
```

**Recommendation**: Option A (mocking) for quick wins, consider Option C for cleaner architecture

### Challenge 2: Logger Calls

**Problem**: Line 85 calls `logger.debug()`

**Solution**: Mock the logger
```typescript
vi.mock('../../src/utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));
```

## What Should Be Tested?

### High Priority Tests (Core Parsing Logic)

#### 1. `run` Command Parsing (Most Complex)
```typescript
describe('run command', () => {
  it('should parse basic run command', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', 'gopls']);
    expect(result.command).toBe('run');
    expect(result.directCommand.commandName).toBe('gopls');
    expect(result.directCommand.commandArgs).toEqual([]);
  });

  it('should parse run command with args', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', 'typescript-language-server', '--stdio']);
    expect(result.directCommand.commandName).toBe('typescript-language-server');
    expect(result.directCommand.commandArgs).toEqual(['--stdio']);
  });

  it('should parse run command with -- delimiter', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', '--', 'typescript-language-server', '--stdio']);
    expect(result.directCommand.commandName).toBe('typescript-language-server');
    expect(result.directCommand.commandArgs).toEqual(['--stdio']);
  });

  it('should parse run with workspace flag before command', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', '--workspace', '/path', 'gopls']);
    expect(result.workspace).toBe('/path');
    expect(result.directCommand.commandName).toBe('gopls');
  });

  it('should parse run with workspace flag using = syntax', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', '--workspace=/path/with spaces', 'gopls']);
    expect(result.workspace).toBe('/path/with spaces');
    expect(result.directCommand.commandName).toBe('gopls');
  });

  it('should handle workspace with equals sign in path', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', '--workspace=/path/with=equals', 'gopls']);
    expect(result.workspace).toBe('/path/with=equals');
  });

  it('should throw error when no command provided', () => {
    expect(() => parseCliArgs(['node', 'symbols', 'run'])).toThrow(
      /run command requires a language server command/
    );
  });

  it('should handle unknown flags as part of command', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', '--unknown-flag', 'value']);
    expect(result.directCommand.commandName).toBe('--unknown-flag');
    expect(result.directCommand.commandArgs).toEqual(['value']);
  });
});
```

#### 2. `start` Command Parsing
```typescript
describe('start command', () => {
  it('should parse basic start command', () => {
    const result = parseCliArgs(['node', 'symbols', 'start']);
    expect(result.command).toBe('start');
  });

  it('should parse start with lsp flag', () => {
    const result = parseCliArgs(['node', 'symbols', 'start', '--lsp', 'typescript']);
    expect(result.command).toBe('start');
    expect(result.lsp).toBe('typescript');
  });

  it('should parse start with workspace and config', () => {
    const result = parseCliArgs([
      'node', 'symbols', 'start',
      '--workspace', '/path',
      '--config', '/config.yaml'
    ]);
    expect(result.workspace).toBe('/path');
    expect(result.configPath).toBe('/config.yaml');
  });
});
```

#### 3. `config` Command Parsing
```typescript
describe('config command', () => {
  it('should parse config init', () => {
    const result = parseCliArgs(['node', 'symbols', 'config', 'init']);
    expect(result.command).toBe('config');
    expect(result.subcommandArgs.subcommand).toBe('init');
  });

  it('should parse config init --global', () => {
    const result = parseCliArgs(['node', 'symbols', 'config', 'init', '--global']);
    expect(result.subcommandArgs.subcommand).toBe('init');
    expect(result.subcommandArgs.global).toBe(true);
  });

  it('should parse config init --force', () => {
    const result = parseCliArgs(['node', 'symbols', 'config', 'init', '--force']);
    expect(result.subcommandArgs.subcommand).toBe('init');
    expect(result.subcommandArgs.force).toBe(true);
  });

  it('should parse config show', () => {
    const result = parseCliArgs(['node', 'symbols', 'config', 'show']);
    expect(result.command).toBe('config');
    expect(result.subcommandArgs.subcommand).toBe('show');
  });

  it('should parse config show --format json', () => {
    const result = parseCliArgs(['node', 'symbols', 'config', 'show', '--format', 'json']);
    expect(result.subcommandArgs.subcommand).toBe('show');
    expect(result.subcommandArgs.format).toBe('json');
  });

  it('should parse config path', () => {
    const result = parseCliArgs(['node', 'symbols', 'config', 'path']);
    expect(result.command).toBe('config');
    expect(result.subcommandArgs.subcommand).toBe('path');
  });
});
```

### Medium Priority Tests (Edge Cases)

#### 4. Edge Cases & Error Handling
```typescript
describe('edge cases', () => {
  it('should handle no command', () => {
    const result = parseCliArgs(['node', 'symbols']);
    expect(result.command).toBe(null);
  });

  it('should handle multiple flags with different syntaxes', () => {
    const result = parseCliArgs([
      'node', 'symbols', 'run',
      '--workspace=/path',
      '--loglevel', 'debug',
      'gopls'
    ]);
    expect(result.workspace).toBe('/path');
    expect(result.loglevel).toBe('debug');
    expect(result.directCommand.commandName).toBe('gopls');
  });

  it('should handle console flag', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', '--console', 'gopls']);
    expect(result.console).toBe(true);
  });

  it('should handle short flag -w for workspace', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', '-w', '/path', 'gopls']);
    expect(result.workspace).toBe('/path');
  });
});
```

### Low Priority Tests (Type Safety)

#### 5. Type Narrowing & Discriminated Unions
```typescript
describe('type discrimination', () => {
  it('should allow type narrowing for run command', () => {
    const result = parseCliArgs(['node', 'symbols', 'run', 'gopls']);

    if (result.command === 'run') {
      // TypeScript should know result is RunCommandArgs here
      expect(result.directCommand).toBeDefined();
    } else {
      fail('Expected run command');
    }
  });

  it('should allow type narrowing for start command', () => {
    const result = parseCliArgs(['node', 'symbols', 'start', '--lsp', 'typescript']);

    if (result.command === 'start') {
      // TypeScript should know result is StartCommandArgs here
      expect(result.lsp).toBe('typescript');
    } else {
      fail('Expected start command');
    }
  });
});
```

## Test Organization Structure

```
test/unit/
  cli.test.ts                 # Main test file
    - run command parsing
    - start command parsing
    - config command parsing
    - edge cases
  cli-run-command.test.ts     # Optional: Split out complex run logic
    - with -- delimiter
    - without -- delimiter
    - flag combinations
    - edge cases
```

## Implementation Approach

### Phase 1: Quick Wins (2-3 hours)
1. Create `test/unit/cli.test.ts` with basic mocking
2. Add 10-15 core tests for `run`, `start`, `config` commands
3. Focus on the complex `run` command logic (lines 346-453)

### Phase 2: Comprehensive Coverage (4-6 hours)
4. Add edge case tests
5. Test error messages
6. Test flag combination scenarios
7. Add tests for validation logic

### Phase 3: Refactoring (Optional, 2-4 hours)
8. Extract validation into separate functions
9. Make dependencies injectable
10. Consider splitting large parseCliArgs function

## Benefits of Testing This Code

1. **Catch regressions**: The `run` command logic is complex (70+ lines) - tests prevent breaking changes
2. **Document behavior**: Tests serve as executable documentation
3. **Enable refactoring**: With tests in place, we can safely refactor the parsing logic
4. **Increase confidence**: Address PR feedback about missing test coverage

## Minimal Example Test File

Here's a starter test file that can be expanded:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCliArgs } from '../../src/utils/cli.js';

// Mock dependencies
vi.mock('../../src/config/lsp-config.js', () => ({
  listAvailableLsps: vi.fn(() => ['typescript', 'python', 'go']),
  loadLspConfig: vi.fn(() => ({
    config: { languageServers: {} },
    source: 'test'
  })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CLI Argument Parsing', () => {
  describe('run command', () => {
    it('should parse basic run command', () => {
      const result = parseCliArgs(['node', 'symbols', 'run', 'gopls']);

      expect(result.command).toBe('run');
      if (result.command === 'run') {
        expect(result.directCommand.commandName).toBe('gopls');
        expect(result.directCommand.commandArgs).toEqual([]);
      }
    });

    it('should parse run command with -- delimiter', () => {
      const result = parseCliArgs([
        'node', 'symbols', 'run', '--',
        'typescript-language-server', '--stdio'
      ]);

      if (result.command === 'run') {
        expect(result.directCommand.commandName).toBe('typescript-language-server');
        expect(result.directCommand.commandArgs).toEqual(['--stdio']);
      }
    });

    it('should throw error when no command provided', () => {
      expect(() => {
        parseCliArgs(['node', 'symbols', 'run']);
      }).toThrow(/run command requires a language server command/);
    });
  });

  describe('start command', () => {
    it('should parse start command with lsp flag', () => {
      const result = parseCliArgs(['node', 'symbols', 'start', '--lsp', 'typescript']);

      expect(result.command).toBe('start');
      if (result.command === 'start') {
        expect(result.lsp).toBe('typescript');
      }
    });
  });

  describe('config command', () => {
    it('should parse config init', () => {
      const result = parseCliArgs(['node', 'symbols', 'config', 'init']);

      expect(result.command).toBe('config');
      if (result.command === 'config') {
        expect(result.subcommandArgs.subcommand).toBe('init');
      }
    });
  });
});
```

## Recommendation

**✅ Yes, unit testing is definitely possible and recommended!**

**Best approach**:
1. Start with Option A (mocking) - quick to implement
2. Write 15-20 core tests covering the complex `run` command logic
3. Add tests for `start` and `config` commands
4. Consider refactoring to Option C (extract validation) in a follow-up PR

**Time estimate**: 3-5 hours for comprehensive test coverage

**ROI**: High - This is complex logic with edge cases that was flagged in PR reviews
