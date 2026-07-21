import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  enrichCodeSnippets,
  type EnrichmentRequest,
} from '../../src/tools/enrichment.js';
import { formatReferencesResults } from '../../src/tools/references.js';
import type { Location } from '../../src/types/lsp.js';

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('enrichment contracts', () => {
  let workspacePath: string;

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbols-enrichment-')
    );
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): string {
    const filePath = path.join(workspacePath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return pathToFileURL(filePath).href;
  }

  function location(uri: string, line: number): Location {
    return {
      uri,
      range: {
        start: { line, character: 0 },
        end: { line, character: 1 },
      },
    };
  }

  it('preserves input order and cardinality across interleaved files and a missing URI', async () => {
    const alphaUri = writeFile('src/alpha.ts', 'alpha first\nalpha second\n');
    const betaUri = writeFile('src/beta.ts', 'beta first\n');
    const inputs: EnrichmentRequest[] = [
      { uri: alphaUri, extent: 'line', line: 0 },
      { uri: betaUri, extent: 'line', line: 0 },
      { uri: alphaUri, extent: 'line', line: 1 },
      { uri: null, extent: 'line', line: 0 },
    ];

    const results = await enrichCodeSnippets(inputs);

    expect(results).toHaveLength(inputs.length);
    expect(results.map(({ request }) => request)).toEqual(inputs);
    expect(results.map(({ codeSnippet }) => codeSnippet)).toEqual([
      'alpha first',
      'beta first',
      'alpha second',
      null,
    ]);
    expect(results[3]?.error).toMatch(/URI/i);
  });

  it('returns one error result when a source file cannot be read', async () => {
    const input: EnrichmentRequest = {
      uri: pathToFileURL(path.join(workspacePath, 'missing.ts')).href,
      extent: 'line',
      line: 0,
    };

    const results = await enrichCodeSnippets([input]);

    expect(results).toHaveLength(1);
    expect(results[0]?.request).toBe(input);
    expect(results[0]?.codeSnippet).toBeNull();
    expect(results[0]?.error).toMatch(/^Could not read file:/);
  });

  it('honors range, line, and declaration extents', async () => {
    const uri = writeFile(
      'src/extents.ts',
      ['export function target(', '  value: string', '): void {}'].join('\n')
    );
    const range = {
      start: { line: 0, character: 16 },
      end: { line: 0, character: 22 },
    };

    const results = await enrichCodeSnippets([
      { uri, extent: 'range', range },
      { uri, extent: 'line', line: 1 },
      {
        uri,
        extent: 'declaration',
        range: {
          start: { line: 0, character: 16 },
          end: { line: 2, character: 10 },
        },
      },
    ]);

    expect(results.map(({ codeSnippet }) => codeSnippet)).toEqual([
      'target',
      '  value: string',
      ['export function target(', '  value: string', '): void {}'].join('\n'),
    ]);
  });

  it('keeps previews attached to interleaved references when the formatter zips by index', async () => {
    const alphaUri = writeFile('src/alpha.ts', 'alpha first\nalpha second\n');
    const betaUri = writeFile('src/beta.ts', 'beta first\n');
    const references = [
      location(alphaUri, 0),
      location(betaUri, 0),
      location(alphaUri, 1),
    ];

    const formatted = await formatReferencesResults(
      references,
      'target',
      workspacePath
    );

    expect(formatted).toBe(
      [
        'Found 3 reference(s) across 2 files',
        '',
        'src/alpha.ts (2 references)',
        '  @1:1 target',
        '    `alpha first`',
        '  @2:1 target',
        '    `alpha second`',
        '',
        'src/beta.ts (1 references)',
        '  @1:1 target',
        '    `beta first`',
      ].join('\n')
    );
  });
});
