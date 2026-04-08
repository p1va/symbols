import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getLspConfig } from '../../src/config/lsp-config.js';

const tempDirs: string[] = [];

function writeConfig(yaml: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbols-config-'));
  tempDirs.push(tempDir);

  const configPath = path.join(tempDir, 'language-servers.yaml');
  fs.writeFileSync(configPath, yaml);
  return configPath;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('LSP config parsing', () => {
  it('applies profile-specific extension fallbacks for built-in profiles', () => {
    const configPath = writeConfig(`
language-servers:
  pyright:
    command: pyright-langserver --stdio
`);

    const config = getLspConfig('pyright', configPath);

    expect(config).not.toBeNull();
    expect(config?.extensions['.py']).toBe('python');
    expect(config?.extensions['.pyi']).toBe('python');
    expect(config?.extensions['.ts']).toBeUndefined();
  });

  it('prefers explicit configured extensions over profile fallbacks', () => {
    const configPath = writeConfig(`
language-servers:
  pyright:
    command: pyright-langserver --stdio
    extensions:
      '.py': 'python'
      '.ipy': 'python'
`);

    const config = getLspConfig('pyright', configPath);

    expect(config).not.toBeNull();
    expect(config?.extensions['.py']).toBe('python');
    expect(config?.extensions['.ipy']).toBe('python');
    expect(config?.extensions['.pyi']).toBeUndefined();
  });

  it('applies profile-specific extension fallbacks for ruby including template files', () => {
    const configPath = writeConfig(`
language-servers:
  ruby:
    command: ruby-lsp
`);

    const config = getLspConfig('ruby', configPath);

    expect(config).not.toBeNull();
    expect(config?.extensions['.rb']).toBe('ruby');
    expect(config?.extensions['.ru']).toBe('ruby');
    expect(config?.extensions['.erb']).toBe('erb');
  });

  it('applies profile-specific extension fallbacks for clangd uppercase C++ files', () => {
    const configPath = writeConfig(`
language-servers:
  clangd:
    command: clangd --background-index
`);

    const config = getLspConfig('clangd', configPath);

    expect(config).not.toBeNull();
    expect(config?.extensions['.C']).toBe('cpp');
    expect(config?.extensions['.H']).toBe('cpp');
  });
});
