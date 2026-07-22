import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';
import * as fs from 'fs';
import {
  prepareFileRequest,
  prepareWorkspaceRequest,
  resolveSymbolTarget,
} from '../../src/preparation.js';
import { createOneBasedPosition } from '../../src/types/position.js';
import { ValidationErrorCode } from '../../src/types.js';
import { createMockSession } from './helpers/mock-lsp-session.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
  },
}));

const mockExistsSync = fs.existsSync as MockedFunction<typeof fs.existsSync>;
const mockStatSync = fs.statSync as MockedFunction<typeof fs.statSync>;
const mockReadFile = fs.promises.readFile as MockedFunction<
  typeof fs.promises.readFile
>;

describe('preparation helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepareFileRequest normalizes the file path', () => {
    const { session } = createMockSession();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);

    const result = prepareFileRequest(session, { file: 'src/test.ts' });

    expect(result).toEqual({
      filePath: '/test/workspace/src/test.ts',
    });
  });

  it('prepareFileRequest preserves validation metadata as the error cause', () => {
    const { session } = createMockSession();
    mockExistsSync.mockReturnValue(false);

    try {
      prepareFileRequest(session, { file: 'missing.ts' });
      expect.fail('Expected prepareFileRequest to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toMatchObject({
        errorCode: ValidationErrorCode.InvalidPath,
      });
    }
  });

  it('resolveSymbolTarget validates and returns both coordinate forms', async () => {
    const { session } = createMockSession();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
    mockReadFile.mockResolvedValue('alpha\nbeta\ngamma');

    const result = await resolveSymbolTarget(session, {
      file: 'src/test.ts',
      position: createOneBasedPosition(2, 3),
    });

    expect(result).toEqual({
      filePath: '/test/workspace/src/test.ts',
      position: createOneBasedPosition(2, 3),
      lspPosition: { line: 1, character: 2 },
    });
  });

  it('resolveSymbolTarget rejects an out-of-bounds position', async () => {
    const { session } = createMockSession();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
    mockReadFile.mockResolvedValue('alpha\nbeta');

    await expect(
      resolveSymbolTarget(session, {
        file: 'src/test.ts',
        position: createOneBasedPosition(3, 1),
      })
    ).rejects.toThrow('Line 3 is out of bounds. File has 2 lines.');
  });

  it('prepareWorkspaceRequest preserves workspace validation metadata', () => {
    const { session } = createMockSession({
      workspaceState: {
        isReady: false,
        isLoading: false,
      },
    });

    try {
      prepareWorkspaceRequest(session, { query: 'TestClass' });
      expect.fail('Expected prepareWorkspaceRequest to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toMatchObject({
        errorCode: ValidationErrorCode.WorkspaceNotReady,
      });
    }
  });
});
