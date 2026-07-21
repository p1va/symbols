import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  extractHoverContent,
  formatLocationGroup,
} from '../../src/tools/inspect.js';
import { formatReferencesResults } from '../../src/tools/references.js';
import { formatCompletionResults } from '../../src/tools/completion.js';
import {
  formatRenameResults,
  getSymbolKindName,
} from '../../src/tools/utils.js';
import type { Hover, Location } from 'vscode-languageserver-protocol';

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('position tool rendering contracts', () => {
  let workspacePath: string;

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbols-tool-formatters-')
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): string {
    const filePath = path.join(workspacePath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return pathToFileURL(filePath).href;
  }

  it('renders references with one-based line and character coordinates', async () => {
    const uri = writeFile(
      'src/example.ts',
      'export const target = 1;\ntarget();\n'
    );
    const references: Location[] = [
      {
        uri,
        range: {
          start: { line: 0, character: 13 },
          end: { line: 0, character: 19 },
        },
      },
      {
        uri,
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 6 },
        },
      },
    ];

    await expect(
      formatReferencesResults(references, 'target', workspacePath)
    ).resolves.toBe(
      [
        'Found 2 reference(s) across 1 file',
        '',
        'src/example.ts (2 references)',
        '  @1:14 target',
        '    `export const target = 1;`',
        '  @2:1 target',
        '    `target();`',
      ].join('\n')
    );
  });

  it('renders inspect locations without changing the public coordinate base', async () => {
    const uri = writeFile('src/example.ts', 'export function target() {}\n');

    await expect(
      formatLocationGroup(
        [
          {
            uri,
            range: {
              start: { line: 0, character: 7 },
              end: { line: 0, character: 13 },
            },
          },
        ],
        'Definition',
        workspacePath
      )
    ).resolves.toBe(
      [
        'Definition (1 location)',
        '',
        'src/example.ts (1)',
        '  @1:8',
        '    `export function target() {}`',
      ].join('\n')
    );
  });

  it('renders completion details and documentation exactly', () => {
    expect(
      formatCompletionResults([
        {
          label: 'target',
          kind: 6,
          detail: 'target(): void',
          documentation: 'Calls the target.\nMore details.',
          insertText: 'target',
          filterText: 'target',
          sortText: 'target',
        },
      ])
    ).toBe(
      [
        'Found 1 completion suggestion',
        '',
        'Methods (1)',
        '  target - target(): void',
        '    // Calls the target.',
      ].join('\n')
    );
  });

  it('reads each renamed file once while rendering all change previews', async () => {
    const uri = writeFile('src/example.ts', 'const newName = 1;\nnewName();\n');
    const readFile = vi.spyOn(fs.promises, 'readFile');

    await expect(
      formatRenameResults(
        [
          {
            fileUri: uri,
            success: true,
            appliedChanges: [
              {
                range: {
                  start: { line: 0, character: 6 },
                  end: { line: 0, character: 13 },
                },
                oldText: 'oldName',
                newText: 'newName',
              },
              {
                range: {
                  start: { line: 1, character: 0 },
                  end: { line: 1, character: 7 },
                },
                oldText: 'oldName',
                newText: 'newName',
              },
            ],
            failedChanges: [],
          },
        ],
        'oldName',
        'newName',
        workspacePath
      )
    ).resolves.toBe(
      [
        "Rename 'oldName' → 'newName': 2 changes across 1 file(s)",
        '',
        'src/example.ts (2 changes)',
        '  ✓ @1:7 oldName → newName',
        '    `const newName = 1;`',
        '  ✓ @2:1 oldName → newName',
        '    `newName();`',
      ].join('\n')
    );

    expect(readFile).toHaveBeenCalledOnce();
  });

  it('returns stable names for known and unknown symbol kinds', () => {
    expect(getSymbolKindName(5)).toBe('Class');
    expect(getSymbolKindName(999)).toBe('Unknown');
  });

  it.each<[string, Hover['contents'], string]>([
    ['plain text', 'Plain documentation', 'Plain documentation'],
    [
      'markup content',
      { kind: 'markdown', value: '**Markdown** documentation' },
      '**Markdown** documentation',
    ],
    [
      'marked strings',
      ['First', { language: 'typescript', value: 'const target = 1;' }],
      'First\n\nconst target = 1;',
    ],
  ])('extracts %s hover content', (_label, contents, expected) => {
    expect(extractHoverContent({ contents })).toBe(expected);
  });
});
