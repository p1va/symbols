import { describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import type { LspClient, SessionDocuments } from '../../src/types.js';
import { createOneBasedPosition } from '../../src/types/position.js';
import { generateCursorContext } from '../../src/utils/cursor-context.js';

function createClient(): LspClient {
  return {
    connection: {
      sendRequest: vi.fn().mockResolvedValue(null),
    } as never,
    isInitialized: true,
  };
}

function createDocuments(uri: string, content: string): SessionDocuments {
  return new Map([
    [
      uri,
      {
        uri,
        content,
        version: 1,
        isOpen: true,
      },
    ],
  ]);
}

describe('cursor context', () => {
  it.each([
    ['a blank line', 'first\n\nthird', 2],
    ['a trailing blank line', 'first\n', 2],
    ['an empty file', '', 1],
  ])('renders column 1 on %s', async (_, content, line) => {
    const filePath = '/workspace with spaces/café.ts';
    const uri = pathToFileURL(filePath).href;

    const context = await generateCursorContext(
      'inspect',
      createClient(),
      uri,
      '/definitely/missing/cursor-context.ts',
      createOneBasedPosition(line, 1),
      createDocuments(uri, content)
    );

    expect(context).toMatchObject({
      file: filePath,
      snippet: '|',
      position: { line, character: 1 },
    });
  });
});
