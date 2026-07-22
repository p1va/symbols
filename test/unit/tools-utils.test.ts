import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatFilePath } from '../../src/tools/utils.js';

describe('formatFilePath', () => {
  it('decodes file URIs exactly once', () => {
    const workspacePath = path.resolve('/workspace');
    const filePath = path.join(workspacePath, 'foo%20bar.ts');

    expect(formatFilePath(pathToFileURL(filePath).href, workspacePath)).toBe(
      'foo%20bar.ts'
    );
  });

  it('does not shorten paths in a sibling directory with the same prefix', () => {
    const workspacePath = path.resolve('/workspace/project');
    const siblingFile = path.resolve('/workspace/project-other/file.ts');

    expect(formatFilePath(siblingFile, workspacePath)).toBe(siblingFile);
  });

  it('makes files relative to an explicitly supplied workspace', () => {
    const workspacePath = path.resolve('/configured/workspace');
    const filePath = path.join(workspacePath, 'src', 'file.ts');

    expect(formatFilePath(filePath, workspacePath)).toBe(
      path.join('src', 'file.ts')
    );
  });
});
