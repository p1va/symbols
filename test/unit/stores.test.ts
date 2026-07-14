import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDiagnosticsStore,
  createWindowLogStore,
  DEFAULT_WINDOW_LOG_MAX_MESSAGES,
} from '../../src/state/stores.js';
import type { Diagnostic } from 'vscode-languageserver-protocol';

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: loggerMocks,
}));

function createDiagnostic(message: Diagnostic['message']): Diagnostic {
  return {
    message,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
  };
}

describe('diagnostics store', () => {
  it('bounds entries, truncates messages, and records omissions per URI', () => {
    const store = createDiagnosticsStore({
      maxDiagnosticsPerUri: 2,
      maxMessageCharacters: 32,
      maxMetadataCharacters: 32,
    });
    const uri = 'file:///workspace/file.ts';

    store.addDiagnostics(uri, [
      {
        ...createDiagnostic('x'.repeat(100)),
        code: 'C'.repeat(100),
        source: 'S'.repeat(100),
        data: { ignored: 'x'.repeat(100) },
      },
      createDiagnostic({ kind: 'markdown', value: 'y'.repeat(100) }),
      createDiagnostic('not retained'),
    ]);

    expect(store.getDiagnostics(uri)).toHaveLength(2);
    expect(store.getDiagnostics(uri)[0]?.message).toHaveLength(32);
    expect(store.getDiagnostics(uri)[0]?.message).toContain(
      '… [message truncated]'
    );
    expect(store.getDiagnostics(uri)[1]?.message).toHaveLength(32);
    expect(String(store.getDiagnostics(uri)[0]?.code)).toHaveLength(32);
    expect(store.getDiagnostics(uri)[0]?.source).toHaveLength(32);
    expect(store.getDiagnostics(uri)[0]?.data).toBeUndefined();
    expect(store.getOmittedCount(uri)).toBe(1);
  });

  it('deletes URI state when the server publishes an empty array', () => {
    const store = createDiagnosticsStore({ maxDiagnosticsPerUri: 1 });
    const uri = 'file:///workspace/file.ts';

    store.addDiagnostics(uri, [
      createDiagnostic('retained'),
      createDiagnostic('omitted'),
    ]);
    store.addDiagnostics(uri, []);

    expect(store.diagnostics.has(uri)).toBe(false);
    expect(store.omittedDiagnostics.has(uri)).toBe(false);
    expect(store.getDiagnostics(uri)).toEqual([]);
    expect(store.getOmittedCount(uri)).toBe(0);
  });

  it('clears retained diagnostics and omission counts', () => {
    const store = createDiagnosticsStore({ maxDiagnosticsPerUri: 1 });
    const uri = 'file:///workspace/file.ts';
    store.addDiagnostics(uri, [
      createDiagnostic('retained'),
      createDiagnostic('omitted'),
    ]);

    store.clear();

    expect(store.diagnostics.size).toBe(0);
    expect(store.omittedDiagnostics.size).toBe(0);
  });
});

describe('window log store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retains only the newest messages and counts evictions', () => {
    const store = createWindowLogStore({ maxMessages: 3 });

    for (let index = 1; index <= 5; index += 1) {
      store.addMessage({ type: 3, message: `message-${index}` });
    }

    expect(store.getMessages().map((message) => message.message)).toEqual([
      'message-3',
      'message-4',
      'message-5',
    ]);
    expect(store.getDroppedCount()).toBe(2);
    expect(loggerMocks.debug).toHaveBeenCalledTimes(5);
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('uses a 1,000-message default capacity', () => {
    expect(DEFAULT_WINDOW_LOG_MAX_MESSAGES).toBe(1_000);

    const store = createWindowLogStore();
    for (let index = 0; index <= DEFAULT_WINDOW_LOG_MAX_MESSAGES; index += 1) {
      store.addMessage({ type: 3, message: String(index) });
    }

    expect(store.getMessages()).toHaveLength(DEFAULT_WINDOW_LOG_MAX_MESSAGES);
    expect(store.getMessages()[0]?.message).toBe('1');
    expect(store.getDroppedCount()).toBe(1);
  });

  it('truncates individual messages before retaining them', () => {
    const store = createWindowLogStore({ maxMessageCharacters: 32 });

    store.addMessage({ type: 2, message: 'x'.repeat(100) });

    const storedMessage = store.getMessages()[0]?.message;
    expect(storedMessage).toHaveLength(32);
    expect(storedMessage?.endsWith('… [message truncated]')).toBe(true);
  });

  it('resets retained messages and the eviction count', () => {
    const store = createWindowLogStore({ maxMessages: 1 });
    store.addMessage({ type: 3, message: 'first' });
    store.addMessage({ type: 3, message: 'second' });

    store.clear();

    expect(store.getMessages()).toEqual([]);
    expect(store.getDroppedCount()).toBe(0);
  });
});
