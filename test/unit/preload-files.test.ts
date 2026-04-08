import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getDefaultPreloadEntriesForProfile,
  isTypeScriptServerCommand,
  resolvePreloadEntries,
} from '../../src/utils/preload-files.js';

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbols-preload-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('preload file resolution', () => {
  it('resolves exact paths and only keeps the first match for a glob entry', async () => {
    const workspacePath = createTempWorkspace();
    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, 'src', 'index.ts'), 'export {};');
    fs.writeFileSync(path.join(workspacePath, 'src', 'main.ts'), 'export {};');
    fs.writeFileSync(path.join(workspacePath, 'main.ts'), 'export {};');

    const result = await resolvePreloadEntries(workspacePath, [
      './src/{index,main}.ts',
      './main.ts',
    ]);

    expect(result.missingEntries).toEqual([]);
    expect(result.resolvedEntries).toEqual([
      {
        entry: './src/{index,main}.ts',
        resolvedPath: path.join(workspacePath, 'src', 'index.ts'),
        matchCount: 2,
      },
      {
        entry: './main.ts',
        resolvedPath: path.join(workspacePath, 'main.ts'),
        matchCount: 1,
      },
    ]);
  });

  it('reports missing entries when no file matches', async () => {
    const workspacePath = createTempWorkspace();
    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });

    const result = await resolvePreloadEntries(workspacePath, [
      './src/{index,main}.ts',
      './main.ts',
    ]);

    expect(result.resolvedEntries).toEqual([]);
    expect(result.missingEntries).toEqual([
      './src/{index,main}.ts',
      './main.ts',
    ]);
  });

  it('returns default preload entries only for TypeScript profiles', () => {
    expect(
      getDefaultPreloadEntriesForProfile({
        name: 'typescript',
        commandName: 'npx',
        commandArgs: ['-y', 'typescript-language-server', '--stdio'],
      })
    ).toEqual(['./src/{index,main,app}.ts', './{index,main}.ts']);

    expect(
      getDefaultPreloadEntriesForProfile({
        name: 'pyright',
        commandName: 'pyright-langserver',
        commandArgs: ['--stdio'],
      })
    ).toEqual([]);
  });

  it('detects the TypeScript language server command through wrapped launchers', () => {
    expect(
      isTypeScriptServerCommand('npx', [
        '-y',
        'typescript-language-server',
        '--stdio',
      ])
    ).toBe(true);
    expect(
      isTypeScriptServerCommand('typescript-language-server', ['--stdio'])
    ).toBe(true);
    expect(isTypeScriptServerCommand('pyright-langserver', ['--stdio'])).toBe(
      false
    );
  });
});
