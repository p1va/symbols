import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceConfigurationResponse,
  initializeLspClient,
} from '../../src/lsp-client.js';
import {
  createDiagnosticProviderStore,
  createWorkspaceLoaderStore,
} from '../../src/state/stores.js';
import type { LspClient, LspConfig } from '../../src/types.js';
import type { ParsedLspConfig } from '../../src/config/lsp-config.js';
import type { InitializeParams } from 'vscode-languageserver-protocol';

describe('LSP client request handling', () => {
  it('returns one configuration value for each requested item', () => {
    expect(
      createWorkspaceConfigurationResponse({
        items: [
          { section: 'typescript' },
          { scopeUri: 'file:///workspace', section: 'editor' },
        ],
      })
    ).toEqual([null, null]);
  });

  it('returns an empty response when configuration items are absent', () => {
    expect(createWorkspaceConfigurationResponse(undefined)).toEqual([]);
    expect(createWorkspaceConfigurationResponse({})).toEqual([]);
  });

  it('requests static semantic-token capabilities during initialization', async () => {
    const sendRequest = vi.fn((method: string) => {
      if (method === 'initialize') {
        return Promise.resolve({ capabilities: {} });
      }
      return Promise.reject(new Error(`Unexpected request: ${method}`));
    });
    const sendNotification = vi.fn(() => Promise.resolve());
    const client = {
      connection: { sendRequest, sendNotification },
      isInitialized: false,
    } as unknown as LspClient;
    const config: LspConfig = {
      workspaceUri: 'file:///workspace',
      workspaceName: 'workspace',
    };
    const lspConfig: ParsedLspConfig = {
      name: 'typescript',
      command: 'typescript-language-server --stdio',
      commandName: 'typescript-language-server',
      commandArgs: ['--stdio'],
      extensions: { '.ts': 'typescript' },
      workspace_files: ['tsconfig.json'],
      preload_files: [],
      workspace_ready_delay_ms: 0,
      diagnostics: { strategy: 'push', wait_timeout_ms: 2000 },
      symbols: {},
    };

    const result = await initializeLspClient(
      client,
      config,
      createDiagnosticProviderStore(),
      createWorkspaceLoaderStore(),
      lspConfig
    );

    expect(result.ok).toBe(true);
    const initializeCall = sendRequest.mock.calls.find(
      ([method]) => method === 'initialize'
    );
    const initializeParams = initializeCall?.[1] as
      InitializeParams | undefined;
    expect(
      initializeParams?.capabilities.textDocument?.semanticTokens
        ?.dynamicRegistration
    ).toBe(false);
  });
});
