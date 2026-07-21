import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FileChange } from '../../src/types/lsp.js';
import {
  applyPreparedWorkspaceChanges,
  prepareWorkspaceChanges,
} from '../../src/tools/workspace-edits.js';

function createChange(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  newText: string
): FileChange {
  return {
    range: {
      start: { line: startLine, character: startCharacter },
      end: { line: endLine, character: endCharacter },
    },
    newText,
  };
}

describe('workspace edit planning', () => {
  let workspacePath: string;
  const cleanupPaths: string[] = [];

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbols-workspace-edits-')
    );
    cleanupPaths.push(workspacePath);
  });

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      fs.rmSync(cleanupPath, { recursive: true, force: true });
    }
  });

  function writeFile(relativePath: string, content: string): string {
    const filePath = path.join(workspacePath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  it('preflights every file before applying the prepared contents', async () => {
    const firstPath = writeFile(
      'src/first.ts',
      'const oldName = 1;\nconsole.log(oldName);\n'
    );
    const secondPath = writeFile('src/second.ts', 'export { oldName };\n');
    fs.chmodSync(firstPath, 0o744);

    const plan = await prepareWorkspaceChanges(
      {
        [pathToFileURL(firstPath).href]: [
          createChange(0, 6, 0, 13, 'newName'),
          createChange(1, 12, 1, 19, 'newName'),
        ],
        [pathToFileURL(secondPath).href]: [
          createChange(0, 9, 0, 16, 'newName'),
        ],
      },
      workspacePath
    );

    expect(fs.readFileSync(firstPath, 'utf8')).toContain('oldName');
    expect(fs.readFileSync(secondPath, 'utf8')).toContain('oldName');

    const results = await applyPreparedWorkspaceChanges(plan);

    expect(fs.readFileSync(firstPath, 'utf8')).toBe(
      'const newName = 1;\nconsole.log(newName);\n'
    );
    expect(fs.readFileSync(secondPath, 'utf8')).toBe('export { newName };\n');
    expect(fs.statSync(firstPath).mode & 0o777).toBe(0o744);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.success)).toBe(true);
  });

  it('rejects an outside target before changing valid workspace files', async () => {
    const workspaceFile = writeFile('src/inside.ts', 'oldName\n');
    const outsidePath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbols-workspace-outside-')
    );
    cleanupPaths.push(outsidePath);
    const outsideFile = path.join(outsidePath, 'outside.ts');
    fs.writeFileSync(outsideFile, 'oldName\n', 'utf8');

    await expect(
      prepareWorkspaceChanges(
        {
          [pathToFileURL(workspaceFile).href]: [
            createChange(0, 0, 0, 7, 'newName'),
          ],
          [pathToFileURL(outsideFile).href]: [
            createChange(0, 0, 0, 7, 'newName'),
          ],
        },
        workspacePath
      )
    ).rejects.toThrow('outside the workspace');

    expect(fs.readFileSync(workspaceFile, 'utf8')).toBe('oldName\n');
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('oldName\n');
  });

  it('rejects a workspace symlink that resolves outside the workspace', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const outsidePath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbols-workspace-symlink-')
    );
    cleanupPaths.push(outsidePath);
    const outsideFile = path.join(outsidePath, 'outside.ts');
    const symlinkPath = path.join(workspacePath, 'linked.ts');
    fs.writeFileSync(outsideFile, 'oldName\n', 'utf8');
    fs.symlinkSync(outsideFile, symlinkPath);

    await expect(
      prepareWorkspaceChanges(
        {
          [pathToFileURL(symlinkPath).href]: [
            createChange(0, 0, 0, 7, 'newName'),
          ],
        },
        workspacePath
      )
    ).rejects.toThrow('outside the workspace');

    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('oldName\n');
  });

  it('rejects a late invalid edit without changing any file', async () => {
    const firstPath = writeFile('src/first.ts', 'oldName\n');
    const secondPath = writeFile('src/second.ts', 'oldName\n');

    await expect(
      prepareWorkspaceChanges(
        {
          [pathToFileURL(firstPath).href]: [
            createChange(0, 0, 0, 7, 'newName'),
          ],
          [pathToFileURL(secondPath).href]: [
            createChange(4, 0, 4, 7, 'newName'),
          ],
        },
        workspacePath
      )
    ).rejects.toThrow('out-of-bounds line');

    expect(fs.readFileSync(firstPath, 'utf8')).toBe('oldName\n');
    expect(fs.readFileSync(secondPath, 'utf8')).toBe('oldName\n');
  });

  it('rejects overlapping edits during preflight', async () => {
    const filePath = writeFile('src/overlap.ts', 'oldName\n');

    await expect(
      prepareWorkspaceChanges(
        {
          [pathToFileURL(filePath).href]: [
            createChange(0, 0, 0, 7, 'newName'),
            createChange(0, 3, 0, 7, 'Name'),
          ],
        },
        workspacePath
      )
    ).rejects.toThrow('overlapping edits');

    expect(fs.readFileSync(filePath, 'utf8')).toBe('oldName\n');
  });

  it('aborts before replacement when a target changes after preflight', async () => {
    const firstPath = writeFile('src/first.ts', 'oldName\n');
    const secondPath = writeFile('src/second.ts', 'oldName\n');
    const plan = await prepareWorkspaceChanges(
      {
        [pathToFileURL(firstPath).href]: [createChange(0, 0, 0, 7, 'newName')],
        [pathToFileURL(secondPath).href]: [createChange(0, 0, 0, 7, 'newName')],
      },
      workspacePath
    );
    fs.writeFileSync(secondPath, 'external change\n', 'utf8');

    await expect(applyPreparedWorkspaceChanges(plan)).rejects.toThrow(
      'changed after preflight; no files were replaced'
    );

    expect(fs.readFileSync(firstPath, 'utf8')).toBe('oldName\n');
    expect(fs.readFileSync(secondPath, 'utf8')).toBe('external change\n');
    expect(
      fs
        .readdirSync(path.dirname(firstPath))
        .some((entry) => entry.includes('.symbols-'))
    ).toBe(false);
  });
});
