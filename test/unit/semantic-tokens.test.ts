import { describe, expect, it, vi } from 'vitest';
import { getSemanticTokens } from '../../src/types/lsp.js';
import type { LspClient } from '../../src/types.js';
import {
  SemanticTokensRequest,
  type ServerCapabilities,
} from 'vscode-languageserver-protocol';

function createClient(serverCapabilities: ServerCapabilities): {
  client: LspClient;
  sendRequest: ReturnType<typeof vi.fn>;
} {
  const sendRequest = vi.fn(() =>
    Promise.resolve({ data: [0, 0, 5, 1, 0b10] })
  );
  const client = {
    connection: { sendRequest },
    isInitialized: true,
    serverCapabilities,
  } as unknown as LspClient;

  return { client, sendRequest };
}

describe('semantic token decoding', () => {
  it('decodes token indices with the initialized server legend', async () => {
    const legend = {
      tokenTypes: ['serverNamespace', 'serverClass'],
      tokenModifiers: ['serverDefinition', 'serverReadonly'],
    };
    const { client, sendRequest } = createClient({
      semanticTokensProvider: {
        legend,
        full: { delta: false },
      },
    });

    const result = await getSemanticTokens(
      client,
      'file:///workspace/example.ts',
      'Thing'
    );

    expect(sendRequest).toHaveBeenCalledWith(SemanticTokensRequest.type, {
      textDocument: { uri: 'file:///workspace/example.ts' },
    });
    expect(result).toEqual({
      legend,
      tokens: [
        {
          line: 0,
          character: 0,
          length: 5,
          tokenType: 'serverClass',
          tokenModifiers: ['serverReadonly'],
          text: 'Thing',
        },
      ],
    });
  });

  it.each([
    ['no provider', {}],
    [
      'a range-only provider',
      {
        semanticTokensProvider: {
          legend: { tokenTypes: ['class'], tokenModifiers: [] },
          range: true,
        },
      },
    ],
    [
      'an unusable legend',
      {
        semanticTokensProvider: {
          legend: { tokenTypes: [], tokenModifiers: [] },
          full: true,
        },
      },
    ],
  ] satisfies Array<[string, ServerCapabilities]>)(
    'does not request full tokens with %s',
    async (_, serverCapabilities) => {
      const { client, sendRequest } = createClient(serverCapabilities);

      await expect(
        getSemanticTokens(client, 'file:///workspace/example.ts', 'Thing')
      ).resolves.toBeNull();
      expect(sendRequest).not.toHaveBeenCalled();
    }
  );
});
