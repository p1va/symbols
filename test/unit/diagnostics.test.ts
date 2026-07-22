import { describe, expect, it } from 'vitest';
import type { DiagnosticEntry, DiagnosticsResult } from '../../src/types.js';
import {
  DIAGNOSTIC_MESSAGE_MAX_CHARACTERS,
  DIAGNOSTICS_MAX_ENTRIES,
  formatDiagnostics,
} from '../../src/utils/diagnostics.js';

function createDiagnostic(
  index: number,
  overrides: Partial<DiagnosticEntry> = {}
): DiagnosticEntry {
  return {
    code: `TS${index}`,
    message: `problem-${index}`,
    severity: 1,
    range: {
      start: { line: index, character: 0 },
      end: { line: index, character: 1 },
    },
    source: 'typescript',
    ...overrides,
  };
}

function createResult(
  diagnostics: DiagnosticEntry[],
  omittedCount = 0
): DiagnosticsResult {
  return { diagnostics, omittedCount };
}

describe('diagnostic formatting', () => {
  it('preserves severity and position ordering', () => {
    const formatted = formatDiagnostics(
      createResult([
        createDiagnostic(2, { severity: 2 }),
        createDiagnostic(1, { severity: 1 }),
        createDiagnostic(0, { severity: 1 }),
      ])
    );

    expect(formatted.split('\n')).toEqual([
      '✘ @1:1 [Error][TS0] problem-0 (typescript)',
      '✘ @2:1 [Error][TS1] problem-1 (typescript)',
      '⚠ @3:1 [Warning][TS2] problem-2 (typescript)',
    ]);
  });

  it('enforces entry and output budgets with an omission marker', () => {
    const formatted = formatDiagnostics(
      createResult(
        Array.from({ length: 20 }, (_, index) =>
          createDiagnostic(index, { message: 'x'.repeat(80) })
        ),
        2
      ),
      { maxEntries: 10, maxCharacters: 256 }
    );

    expect(formatted.length).toBeLessThanOrEqual(256);
    expect(formatted).toContain('more diagnostics not shown');
    expect(formatted).toContain('TS0');
    expect(formatted).not.toContain('TS19');
  });

  it('independently caps the default entry count for pull or push results', () => {
    const diagnostics = Array.from(
      { length: DIAGNOSTICS_MAX_ENTRIES + 1 },
      (_, index) => createDiagnostic(index)
    );

    const formatted = formatDiagnostics(createResult(diagnostics));

    expect(formatted).toContain('1 more diagnostic not shown');
    expect(formatted).not.toContain(`TS${DIAGNOSTICS_MAX_ENTRIES}`);
  });

  it('truncates an oversized message before rendering it', () => {
    const formatted = formatDiagnostics(
      createResult([
        createDiagnostic(0, {
          message: 'x'.repeat(DIAGNOSTIC_MESSAGE_MAX_CHARACTERS + 1),
        }),
      ])
    );

    expect(formatted).toContain('… [message truncated]');
    expect(formatted.length).toBeLessThan(
      DIAGNOSTIC_MESSAGE_MAX_CHARACTERS + 100
    );
  });

  it('reports an empty result clearly', () => {
    expect(formatDiagnostics(createResult([]))).toBe(
      'No diagnostics found for this file.'
    );
  });
});
