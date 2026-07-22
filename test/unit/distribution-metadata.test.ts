import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(
    new URL(`../../${relativePath}`, import.meta.url),
    'utf8'
  );
}

describe('distribution metadata', () => {
  it('publishes the npm start argument using MCP Registry field names', async () => {
    const manifest = JSON.parse(await readRepoFile('server.json')) as {
      packages: Array<Record<string, unknown>>;
    };
    const npmPackage = manifest.packages[0];

    expect(npmPackage).toMatchObject({
      registryType: 'npm',
      identifier: '@p1va/symbols',
      packageArguments: [{ type: 'positional', value: 'start' }],
      environmentVariables: [],
    });
    expect(npmPackage).not.toHaveProperty('environment_variables');
  });

  it('uses the native TypeScript profile without legacy readiness workarounds', async () => {
    const defaultConfig = await readRepoFile(
      'assets/default-language-servers.yaml'
    );
    const parsedConfig = load(defaultConfig) as {
      'language-servers': Record<string, Record<string, unknown>>;
    };
    const typeScriptProfile = parsedConfig['language-servers'].typescript;

    expect(defaultConfig).not.toContain('workspace_ready_delay_ms: 3000');
    expect(typeScriptProfile).toMatchObject({
      command: 'npx -y -p typescript@^7.0.2 tsc --lsp --stdio',
      diagnostics: { strategy: 'pull' },
    });
    expect(typeScriptProfile).not.toHaveProperty('preload_files');
  });

  it('keeps the Codex marketplace wired to the Symbols plugin', async () => {
    const marketplace = JSON.parse(
      await readRepoFile('.agents/plugins/marketplace.json')
    ) as {
      name: string;
      plugins: Array<Record<string, unknown>>;
    };

    expect(marketplace.name).toBe('symbols');
    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({
        name: 'symbols',
        source: { source: 'local', path: './plugins/symbols' },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
        },
      })
    );
  });

  it('keeps the native Antigravity distribution at the repository root', async () => {
    const rootManifest = JSON.parse(
      await readRepoFile('plugin.json')
    ) as Record<string, unknown>;
    const nestedManifest = JSON.parse(
      await readRepoFile('plugins/symbols/plugin.json')
    ) as Record<string, unknown>;
    const rootMcpConfig = JSON.parse(
      await readRepoFile('mcp_config.json')
    ) as Record<string, unknown>;
    const nestedMcpConfig = JSON.parse(
      await readRepoFile('plugins/symbols/mcp_config.json')
    ) as Record<string, unknown>;

    expect(rootManifest).toEqual(nestedManifest);
    expect(rootMcpConfig).toEqual(nestedMcpConfig);
    expect(rootMcpConfig).toMatchObject({
      mcpServers: {
        'language-servers': {
          command: 'npx',
          args: ['-y', '@p1va/symbols@latest', 'start'],
        },
      },
    });
  });
});
