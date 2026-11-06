import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { McpTestClient } from '../integration/base/index.js';

// Plugins launch Symbols with `npx -y @p1va/symbols@latest`, which installs
// with npm and no lockfile. Installing the packed tarball the same way tests
// the dependency versions users resolve today, which pnpm-lock.yaml masks.
const repoRoot = process.cwd();
const fixtureDir = path.join(repoRoot, 'test/integration/languages/typescript');

describe('packed npm install', () => {
  let tempDir: string | undefined;
  let client: McpTestClient | undefined;

  beforeAll(async () => {
    const distEntry = path.join(repoRoot, 'dist/index.js');
    if (!fs.existsSync(distEntry)) {
      throw new Error(`Run 'pnpm build' first: ${distEntry} is missing.`);
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbols-packed-'));
    execFileSync('pnpm', ['pack', '--pack-destination', tempDir], {
      cwd: repoRoot,
    });
    const tarball = fs
      .readdirSync(tempDir)
      .find((name) => name.endsWith('.tgz'));
    if (!tarball) {
      throw new Error(`pnpm pack wrote no tarball to ${tempDir}`);
    }

    const installDir = path.join(tempDir, 'install');
    fs.mkdirSync(installDir);
    fs.writeFileSync(path.join(installDir, 'package.json'), '{}');
    execFileSync(
      'npm',
      ['install', '--no-audit', '--no-fund', path.join(tempDir, tarball)],
      { cwd: installDir }
    );

    client = new McpTestClient(
      'node',
      [
        path.join(installDir, 'node_modules/@p1va/symbols/dist/index.js'),
        'start',
      ],
      'packaging-test',
      '1.0.0',
      path.join(fixtureDir, 'test-project'),
      path.join(fixtureDir, 'language-servers.yaml')
    );
    await client.connect();
  }, 180_000);

  afterAll(async () => {
    await client?.close();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('initializes a real language server and answers a request', async () => {
    const result = await client!.outline(
      path.join(fixtureDir, 'test-project/src/main.ts')
    );

    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    expect(JSON.stringify(result.content)).toContain('TestService');
  }, 120_000);
});
