# Config Handler Testing Analysis

## Two Levels of Testing

### Level 1: CLI Parsing (`parseCliArgs`) - NO MOCKING NEEDED ✅

The PR review requested testing the "complex command line args logic" - this is just parsing:

```typescript
describe('config command parsing', () => {
  it('should parse config init', () => {
    const result = parseCliArgs(['node', 'symbols', 'config', 'init']);

    expect(result.command).toBe('config');
    expect(result.subcommandArgs.subcommand).toBe('init');
  });

  it('should parse config init --global --force', () => {
    const result = parseCliArgs(['node', 'symbols', 'config', 'init', '--global', '--force']);

    expect(result.subcommandArgs.global).toBe(true);
    expect(result.subcommandArgs.force).toBe(true);
  });
});
```

**No file system operations happen during parsing!**

---

### Level 2: Config Handlers - HEAVY MOCKING REQUIRED ⚠️

Testing `handleConfigInit()`, `handleConfigShow()`, `handleConfigPath()` requires mocking:

#### `handleConfigInit()` Dependencies

```typescript
// File System Operations (lines 589-610)
- fs.existsSync(configPath)        // Check if config exists
- fs.mkdirSync(configDir)          // Create directory
- fs.readFileSync(defaultConfigPath) // Read template
- fs.writeFileSync(configPath)     // Write config file

// Other Dependencies
- getAppPaths()                    // Get system paths
- process.cwd()                    // Current directory
- process.exit(1)                  // Exit on error
- console.log()                    // Output messages
- console.error()                  // Error messages
```

#### Test Example with Mocking

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { handleConfigInit } from '../../src/utils/cli.js';

// Mock file system
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock app paths
vi.mock('../../src/utils/app-paths.js', () => ({
  getAppPaths: vi.fn(() => ({
    config: '/home/user/.config/symbols',
    data: '/home/user/.local/share/symbols',
  })),
}));

// Mock console
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock process.exit to throw instead
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

describe('handleConfigInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create local config file', () => {
    // Setup mocks
    (fs.existsSync as any).mockReturnValue(false);
    (fs.readFileSync as any).mockReturnValue('# Config template');

    handleConfigInit({
      subcommand: 'init',
      force: false,
      workspace: '/tmp/test-project',
    });

    // Verify directory was created
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      '/tmp/test-project',
      { recursive: true }
    );

    // Verify file was written
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/test-project/language-servers.yaml',
      '# Config template'
    );

    // Verify success message
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('Configuration file created')
    );
  });

  it('should create global config file', () => {
    (fs.existsSync as any).mockReturnValue(false);
    (fs.readFileSync as any).mockReturnValue('# Config template');

    handleConfigInit({
      subcommand: 'init',
      global: true,
      force: false,
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/home/user/.config/symbols/language-servers.yaml',
      '# Config template'
    );
  });

  it('should fail when file exists without --force', () => {
    (fs.existsSync as any).mockReturnValue(true);

    expect(() => {
      handleConfigInit({
        subcommand: 'init',
        force: false,
      });
    }).toThrow('process.exit(1)');

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('already exists')
    );
  });

  it('should overwrite when --force is used', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue('# Config template');

    handleConfigInit({
      subcommand: 'init',
      force: true,
    });

    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should handle read errors gracefully', () => {
    (fs.existsSync as any).mockReturnValue(false);
    (fs.readFileSync as any).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    expect(() => {
      handleConfigInit({
        subcommand: 'init',
      });
    }).toThrow('process.exit(1)');

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Error creating configuration file'),
      'Permission denied'
    );
  });
});
```

#### `handleConfigShow()` Dependencies

```typescript
- loadLspConfig(configPath)  // Reads YAML config files
- console.log()              // Output configuration
- console.error()            // Error messages
- process.exit(1)            // Exit on error
```

#### `handleConfigPath()` Dependencies

```typescript
- getAppPaths()              // Get system paths
- process.cwd()              // Current directory
- fs.existsSync()            // Check if files exist (line 674+)
- console.log()              // Output paths
```

---

## Recommendation for PR Review

The PR review asked for testing "complex command line args logic" - this refers to **Level 1** (parsing).

### Recommended Approach

1. **Start with Level 1** (parseCliArgs tests) - **NO MOCKING NEEDED**
   - Quick to implement (2-3 hours)
   - Directly addresses PR feedback
   - Tests the complex parsing logic (especially `run` command)

2. **Consider Level 2** (handler tests) as a **separate effort**
   - More time-consuming (requires extensive mocking)
   - Tests integration logic, not parsing logic
   - Could be split into a separate PR

### Specific Answer to Your Question

> "For the tests on config do we need to mock anything? For example init will try to write"

**For `parseCliArgs()` tests**: NO, no mocking needed! Parsing doesn't touch the file system.

**For `handleConfigInit()` tests**: YES, need to mock:
- `fs.*` functions (existsSync, mkdirSync, readFileSync, writeFileSync)
- `getAppPaths()`
- `process.cwd()`
- `process.exit()`
- `console.log/error()`

---

## Alternative: Use Temp Directories Instead of Mocking

For handler tests, another option is using **real file system with temp directories**:

```typescript
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('handleConfigInit - integration tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'symbols-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create config file in temp directory', () => {
    handleConfigInit({
      subcommand: 'init',
      workspace: tempDir,
      force: false,
    });

    // Check file actually exists
    const configPath = join(tempDir, 'language-servers.yaml');
    expect(fs.existsSync(configPath)).toBe(true);

    // Check content
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain('language-servers:');
  });
});
```

**Pros:**
- Tests real behavior
- No complex mocking
- Catches actual file system issues

**Cons:**
- Slower than unit tests
- Requires cleanup
- Still need to mock console and process.exit

---

## Summary Table

| Test Type | Mocking Required? | What to Mock | Effort | Priority |
|-----------|-------------------|--------------|--------|----------|
| `parseCliArgs()` config | ❌ NO | Nothing! | Low | **High** (PR request) |
| `parseCliArgs()` run | ⚠️ Minimal | `listAvailableLsps` | Low | **High** (PR request) |
| `parseCliArgs()` start | ⚠️ Minimal | `listAvailableLsps` | Low | **High** (PR request) |
| `handleConfigInit()` | ✅ YES | fs, console, process | High | Medium |
| `handleConfigShow()` | ✅ YES | loadLspConfig, console | Medium | Low |
| `handleConfigPath()` | ✅ YES | fs, getAppPaths, console | Medium | Low |

**Recommendation**: Focus on `parseCliArgs()` tests first - this directly addresses the PR feedback with minimal mocking!
