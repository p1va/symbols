import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLspManager } from '../../src/runtime/lsp-manager.js';
import type {
  LspSession,
  LspSessionOwnershipSink,
  LspSessionProfile,
  SessionState,
} from '../../src/runtime/lsp-session.js';

vi.mock('../../src/utils/cli.js', () => ({
  resolveStartConfig: vi.fn(),
  resolveRunConfig: vi.fn(),
}));

vi.mock('../../src/config/lsp-config.js', () => ({
  autoDetectLsp: vi.fn(),
  createConfigFromDirectCommand: vi.fn(),
  getLspConfig: vi.fn(),
  listAvailableLsps: vi.fn(),
}));

vi.mock('../../src/runtime/lsp-session.js', async () => {
  const actual = await vi.importActual('../../src/runtime/lsp-session.js');
  return {
    ...actual,
    createLspSession: vi.fn(),
  };
});

import {
  resolveStartConfig,
  type StartCommandArgs,
} from '../../src/utils/cli.js';
import {
  autoDetectLsp,
  getLspConfig,
  listAvailableLsps,
  type ParsedLspConfig,
} from '../../src/config/lsp-config.js';
import { createLspSession } from '../../src/runtime/lsp-session.js';

const mockResolveStartConfig = vi.mocked(resolveStartConfig);
const mockListAvailableLsps = vi.mocked(listAvailableLsps);
const mockGetLspConfig = vi.mocked(getLspConfig);
const mockAutoDetectLsp = vi.mocked(autoDetectLsp);
const mockCreateLspSession = vi.mocked(createLspSession);

interface MockSessionState {
  state: SessionState;
}

interface MockSessionRecord {
  session: LspSession;
  profileName: string;
  ownershipSink: LspSessionOwnershipSink;
  state: MockSessionState;
  startMock: ReturnType<typeof vi.fn>;
  stopMock: ReturnType<typeof vi.fn>;
  restartMock: ReturnType<typeof vi.fn>;
}

function createParsedConfig(
  name: string,
  extensions: Record<string, string>
): ParsedLspConfig {
  return {
    name,
    command: `${name}-lsp --stdio`,
    commandName: `${name}-lsp`,
    commandArgs: ['--stdio'],
    extensions,
    workspace_files: [],
    preload_files: [],
    diagnostics: {
      strategy: 'push',
      wait_timeout_ms: 2000,
    },
    symbols: {},
  };
}

function createProfile(
  name: string,
  workspacePath: string,
  extensions: Record<string, string>
): LspSessionProfile {
  return {
    name,
    workspacePath,
    workspaceUri: pathToFileURL(workspacePath).href,
    workspaceName: path.basename(workspacePath),
    configPath: null,
    config: createParsedConfig(name, extensions),
  };
}

function createMockSessionRecord(
  sessionKey: string,
  initialProfile: LspSessionProfile,
  ownershipSink: LspSessionOwnershipSink
): MockSessionRecord {
  let profile = initialProfile;
  const ownedDocuments = new Set<string>();
  const state: MockSessionState = { state: 'stopped' };
  const startMock = vi.fn(() => {
    state.state = 'ready';
    return Promise.resolve();
  });
  const stopMock = vi.fn(() => {
    state.state = 'stopped';
    return Promise.resolve();
  });
  const restartMock = vi.fn(() => {
    state.state = 'stopped';
    state.state = 'ready';
    return Promise.resolve();
  });

  const session: LspSession = {
    sessionKey,
    getProfile: () => profile,
    setProfile: (nextProfile) => {
      profile = nextProfile;
    },
    canHandleFile: (filePath) => {
      const extension = path.extname(
        path.isAbsolute(filePath)
          ? path.normalize(filePath)
          : path.normalize(path.resolve(profile.workspacePath, filePath))
      );
      return Boolean(extension && profile.config.extensions[extension]);
    },
    isReady: () => state.state === 'ready',
    isActive: () => state.state === 'ready' || state.state === 'starting',
    start: startMock,
    stop: stopMock,
    restart: restartMock,
    request: vi.fn(),
    getWorkspaceState: vi.fn(() => ({
      isReady: true,
      isLoading: false,
    })),
    getDiagnosticsStore: vi.fn(() => ({}) as never),
    getDiagnosticProviderStore: vi.fn(() => ({}) as never),
    getWindowLogStore: vi.fn(() => ({
      getMessages: () => [],
    })),
    executeWithCursorContext: vi.fn(),
    executeWithDocumentLifecycle: vi.fn(),
    claimDocument: (filePath) => {
      const normalizedPath = path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.normalize(path.resolve(profile.workspacePath, filePath));
      ownedDocuments.add(normalizedPath);
      return normalizedPath;
    },
    releaseDocument: (filePath) => {
      const normalizedPath = path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.normalize(path.resolve(profile.workspacePath, filePath));
      return ownedDocuments.delete(normalizedPath) ? normalizedPath : null;
    },
    listOwnedDocuments: () => [...ownedDocuments.values()].sort(),
    clearOwnedDocuments: () => {
      const documents = [...ownedDocuments.values()].sort();
      ownedDocuments.clear();
      return documents;
    },
    getStatusSnapshot: () => ({
      sessionKey,
      profileName: profile.name,
      state: state.state,
      command:
        `${profile.config.commandName} ${profile.config.commandArgs.join(' ')}`.trim(),
      workspacePath: profile.workspacePath,
      lastError: null,
      pid: null,
      extensions: Object.keys(profile.config.extensions).sort(),
      preloadFiles: [...profile.config.preload_files],
      diagnosticsStrategy: profile.config.diagnostics.strategy,
      workspaceLoader: profile.config.workspace_loader || null,
      workspaceReady: true,
      workspaceLoading: false,
      windowLogCount: 0,
    }),
  };

  return {
    session,
    profileName: initialProfile.name,
    ownershipSink,
    state,
    startMock,
    stopMock,
    restartMock,
  };
}

describe('LspManager routing', () => {
  const workspacePath = '/workspace';
  const alphaProfile = createProfile('alpha', workspacePath, {
    '.ts': 'typescript',
  });
  const betaProfile = createProfile('beta', workspacePath, {
    '.ts': 'typescript',
  });
  const sessionRecords = new Map<string, MockSessionRecord>();

  function emitDocumentClaim(profileName: string, filePath: string): void {
    const record = sessionRecords.get(profileName);
    if (!record) {
      throw new Error(`Session for profile '${profileName}' not found`);
    }

    const normalizedPath = record.session.claimDocument(filePath);
    const uri = pathToFileURL(normalizedPath).href;
    record.ownershipSink.onDocumentClaimed?.(
      record.session.sessionKey,
      normalizedPath,
      uri
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionRecords.clear();

    mockResolveStartConfig.mockReturnValue({
      command: 'start',
      workspace: workspacePath,
      configPath: undefined,
      lsp: undefined,
      loglevel: 'info',
      console: false,
    });
    mockListAvailableLsps.mockReturnValue(['alpha', 'beta']);
    mockAutoDetectLsp.mockReturnValue('alpha');
    mockGetLspConfig.mockImplementation((profileName) => {
      if (profileName === 'alpha') {
        return alphaProfile.config;
      }
      if (profileName === 'beta') {
        return betaProfile.config;
      }
      return null;
    });

    mockCreateLspSession.mockImplementation(
      (sessionKey, profile, ownershipSink) => {
        const record = createMockSessionRecord(
          sessionKey,
          profile,
          ownershipSink ?? {}
        );
        sessionRecords.set(profile.name, record);
        return record.session;
      }
    );
  });

  it('reuses the session that already owns an open document', async () => {
    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    const betaSession = await manager.start('beta');
    emitDocumentClaim('beta', 'src/test.ts');

    const routedSession = await manager.getSessionForFile('src/test.ts');
    const alphaRecord = sessionRecords.get('alpha');

    expect(routedSession).toBe(betaSession);
    expect(routedSession.getProfile().name).toBe('beta');
    expect(alphaRecord).toBeDefined();
    expect(alphaRecord?.startMock).not.toHaveBeenCalled();
  });

  it('routes unopened files by profile resolution instead of reusing a warm compatible session', async () => {
    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    const betaSession = await manager.start('beta');
    const routedSession = await manager.getSessionForFile('src/other.ts');
    const betaRecord = sessionRecords.get('beta');
    const alphaRecord = sessionRecords.get('alpha');

    expect(betaSession.getProfile().name).toBe('beta');
    expect(routedSession.getProfile().name).toBe('alpha');
    expect(betaRecord).toBeDefined();
    expect(alphaRecord).toBeDefined();
    expect(betaRecord?.startMock).toHaveBeenCalledTimes(1);
    expect(alphaRecord?.startMock).toHaveBeenCalledTimes(1);
  });
});
