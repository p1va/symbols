import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateWorkspaceReady,
  validateAndNormalizeFilePath,
  validatePosition,
  validateFileRequest,
  validateSymbolPositionRequest,
  validateWorkspaceOperation,
} from '../../src/validation.js';
import {
  ValidationErrorCode,
  type LspContext,
  type SymbolPositionRequest,
  type FileRequest,
} from '../../src/types.js';
import { createOneBasedPosition } from '../../src/types/position.js';

// Mock the fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
  },
}));

// Get typed mocks
const mockExistsSync = fs.existsSync as MockedFunction<typeof fs.existsSync>;
const mockStatSync = fs.statSync as MockedFunction<typeof fs.statSync>;
const mockReadFile = fs.promises.readFile as MockedFunction<
  typeof fs.promises.readFile
>;

// Helper to create a basic mock LspContext
function createMockContext(overrides: Partial<LspContext> = {}): LspContext {
  return {
    client: {} as LspContext['client'],
    preloadedFiles: new Map(),
    diagnosticsStore: {} as LspContext['diagnosticsStore'],
    diagnosticProviderStore: {} as LspContext['diagnosticProviderStore'],
    windowLogStore: {} as LspContext['windowLogStore'],
    workspaceState: {
      isReady: true,
      isLoading: false,
      loadingStartedAt: undefined,
    },
    workspaceUri: 'file:///test/workspace',
    workspacePath: '/test/workspace',
    lspName: 'typescript',
    lspConfig: null,
    ...overrides,
  } as LspContext;
}

describe('Validation Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateWorkspaceReady', () => {
    it('should return valid when workspace is ready', () => {
      const ctx = createMockContext({
        workspaceState: {
          isReady: true,
          isLoading: false,
          loadingStartedAt: undefined,
        },
      });

      const result = validateWorkspaceReady(ctx);
      expect(result.valid).toBe(true);
    });

    it('should return invalid when workspace is loading', () => {
      const loadingTime = new Date('2024-01-01T10:00:00Z');
      const ctx = createMockContext({
        workspaceState: {
          isReady: false,
          isLoading: true,
          loadingStartedAt: loadingTime,
        },
      });

      const result = validateWorkspaceReady(ctx);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(
          ValidationErrorCode.WorkspaceNotReady
        );
        expect(result.error.message).toContain('still loading');
        expect(result.error.message).toContain('2024-01-01T10:00:00.000Z');
      }
    });

    it('should return invalid when workspace is not ready', () => {
      const ctx = createMockContext({
        workspaceState: {
          isReady: false,
          isLoading: false,
          loadingStartedAt: undefined,
        },
      });

      const result = validateWorkspaceReady(ctx);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(
          ValidationErrorCode.WorkspaceNotReady
        );
        expect(result.error.message).toContain('not ready');
      }
    });
  });

  describe('validateAndNormalizeFilePath', () => {
    it('should validate and normalize absolute path', () => {
      const filePath = '/absolute/path/file.ts';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = validateAndNormalizeFilePath(filePath);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.absolutePath).toBe(path.resolve(filePath));
      }
    });

    it('should resolve relative path using workspace directory', () => {
      const filePath = 'src/file.ts';
      const workspaceDir = '/test/workspace';
      const expectedPath = path.resolve(workspaceDir, filePath);

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = validateAndNormalizeFilePath(filePath, workspaceDir);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.absolutePath).toBe(expectedPath);
      }
      expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
    });

    it('should return invalid for non-existent file', () => {
      const filePath = '/nonexistent/file.ts';
      mockExistsSync.mockReturnValue(false);

      const result = validateAndNormalizeFilePath(filePath);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(ValidationErrorCode.InvalidPath);
        expect(result.error.message).toContain('File not found');
      }
    });

    it('should return invalid for directory instead of file', () => {
      const filePath = '/path/to/directory';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => false } as fs.Stats);

      const result = validateAndNormalizeFilePath(filePath);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(ValidationErrorCode.InvalidPath);
        expect(result.error.message).toContain('not a file');
      }
    });

    it('should handle file system errors', () => {
      const filePath = '/path/file.ts';
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = validateAndNormalizeFilePath(filePath);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(ValidationErrorCode.InvalidPath);
        expect(result.error.message).toContain('Permission denied');
      }
    });
  });

  describe('validatePosition', () => {
    it('should validate position within file bounds', async () => {
      const filePath = '/test/file.ts';
      const fileContent = 'line 1\nline 2\nline 3';
      const position = createOneBasedPosition(2, 3);

      mockReadFile.mockResolvedValue(fileContent);

      const result = await validatePosition(filePath, position);

      expect(result.valid).toBe(true);
      expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('should return invalid for line out of bounds', async () => {
      const filePath = '/test/file.ts';
      const fileContent = 'line 1\nline 2';
      const position = createOneBasedPosition(3, 1);

      mockReadFile.mockResolvedValue(fileContent);

      const result = await validatePosition(filePath, position);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(
          ValidationErrorCode.PositionOutOfBounds
        );
        expect(result.error.message).toContain('Line 3 is out of bounds');
        expect(result.error.message).toContain('File has 2 lines');
      }
    });

    it('should return invalid for character out of bounds', async () => {
      const filePath = '/test/file.ts';
      const fileContent = 'short';
      const position = createOneBasedPosition(1, 10);

      mockReadFile.mockResolvedValue(fileContent);

      const result = await validatePosition(filePath, position);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(
          ValidationErrorCode.PositionOutOfBounds
        );
        expect(result.error.message).toContain('Character 10 is out of bounds');
        expect(result.error.message).toContain('Line 1 has 5 characters');
      }
    });

    it('should handle file read errors', async () => {
      const filePath = '/test/unreadable.ts';
      const position = createOneBasedPosition(1, 1);

      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const result = await validatePosition(filePath, position);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(ValidationErrorCode.InvalidPath);
        expect(result.error.message).toContain('Permission denied');
      }
    });
  });

  describe('validateFileRequest', () => {
    it('should validate file request successfully', () => {
      const ctx = createMockContext();
      const request: FileRequest = { file: 'src/file.ts' };

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = validateFileRequest(ctx, request);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.absolutePath).toBeDefined();
      }
    });

    it('should fail if workspace is not ready', () => {
      const ctx = createMockContext({
        workspaceState: {
          isReady: false,
          isLoading: false,
          loadingStartedAt: undefined,
        },
      });
      const request: FileRequest = { file: 'src/file.ts' };

      const result = validateFileRequest(ctx, request);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(
          ValidationErrorCode.WorkspaceNotReady
        );
      }
    });
  });

  describe('validateSymbolPositionRequest', () => {
    it('should validate symbol position request successfully', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: 'src/file.ts',
        position: createOneBasedPosition(1, 1),
      };

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
      mockReadFile.mockResolvedValue('console.log("hello");');

      const result = await validateSymbolPositionRequest(ctx, request);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.absolutePath).toBeDefined();
      }
    });

    it('should fail if position is out of bounds', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: 'src/file.ts',
        position: createOneBasedPosition(5, 1),
      };

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
      mockReadFile.mockResolvedValue('line 1\nline 2');

      const result = await validateSymbolPositionRequest(ctx, request);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(
          ValidationErrorCode.PositionOutOfBounds
        );
      }
    });
  });

  describe('validateWorkspaceOperation', () => {
    it('should validate workspace operation when ready', () => {
      const ctx = createMockContext();

      const result = validateWorkspaceOperation(ctx);

      expect(result.valid).toBe(true);
    });

    it('should fail when workspace is not ready', () => {
      const ctx = createMockContext({
        workspaceState: {
          isReady: false,
          isLoading: false,
          loadingStartedAt: undefined,
        },
      });

      const result = validateWorkspaceOperation(ctx);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.errorCode).toBe(
          ValidationErrorCode.WorkspaceNotReady
        );
      }
    });
  });
});
