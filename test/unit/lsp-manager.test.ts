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
  loadLspConfig: vi.fn(),
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
  loadLspConfig,
  type ParsedLspConfig,
} from '../../src/config/lsp-config.js';
import { createLspSession } from '../../src/runtime/lsp-session.js';

const mockResolveStartConfig = vi.mocked(resolveStartConfig);
const mockLoadLspConfig = vi.mocked(loadLspConfig);
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
  extensions: Record<string, string>,
  commandArgs: string[] = ['--stdio']
): ParsedLspConfig {
  return {
    name,
    command: `${name}-lsp ${commandArgs.join(' ')}`.trim(),
    commandName: `${name}-lsp`,
    commandArgs,
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

function createMockSessionRecord(
  sessionKey: string,
  initialProfile: LspSessionProfile,
  ownershipSink: LspSessionOwnershipSink
): MockSessionRecord {
  let profile = initialProfile;
  const ownedDocuments = new Set<string>();
  const state: MockSessionState = { state: 'not_started' };
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
      workspaceReady:
        state.state === 'not_started' || state.state === 'stopped'
          ? null
          : state.state === 'ready',
      workspaceLoading:
        state.state === 'not_started' || state.state === 'stopped'
          ? null
          : state.state === 'starting',
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
  const sessionRecords = new Map<string, MockSessionRecord>();
  let configuredProfiles: Record<string, ParsedLspConfig>;

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
    configuredProfiles = {
      alpha: createParsedConfig('alpha', {
        '.ts': 'typescript',
      }),
      beta: createParsedConfig('beta', {
        '.ts': 'typescript',
      }),
    };

    mockResolveStartConfig.mockReturnValue({
      command: 'start',
      workspace: workspacePath,
      configPath: undefined,
      lsp: undefined,
      loglevel: 'info',
      console: false,
    });
    mockLoadLspConfig.mockImplementation(() => ({
      config: {
        'language-servers': configuredProfiles,
      },
      source: {
        path: '/workspace/language-servers.yaml',
        type: 'workspace',
        description: 'Found in workspace directory',
      },
    }));
    mockAutoDetectLsp.mockReturnValue('alpha');
    mockGetLspConfig.mockImplementation(
      (profileName) => configuredProfiles[profileName] || null
    );

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

  it('reports the effective config path from the selected config source', async () => {
    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    expect(manager.getStatus().configPath).toBe(
      '/workspace/language-servers.yaml'
    );
  });

  it('reports untouched configured profiles as not_started', async () => {
    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    expect(manager.getProfileStatus('alpha')).toMatchObject({
      state: 'not_started',
      workspaceReady: null,
      workspaceLoading: null,
    });
    expect(manager.getProfileStatus('beta')).toMatchObject({
      state: 'not_started',
      workspaceReady: null,
      workspaceLoading: null,
    });
  });

  it('reports stopped after an explicitly started session is stopped', async () => {
    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    await manager.start('alpha');
    await manager.stop('alpha');

    expect(manager.getProfileStatus('alpha')).toMatchObject({
      state: 'stopped',
      workspaceReady: null,
      workspaceLoading: null,
    });
  });

  it('keeps a running session on its launch snapshot until reload is applied', async () => {
    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    await manager.start('alpha');
    configuredProfiles.alpha = createParsedConfig(
      'alpha',
      {
        '.ts': 'typescript',
      },
      ['--stdio', '--from-detect']
    );

    await manager.detect();

    expect(
      sessionRecords.get('alpha')?.session.getProfile().config.commandArgs
    ).toEqual(['--stdio']);
  });

  it('reload reapplies config to running sessions without starting dormant ones', async () => {
    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    await manager.start('alpha');
    configuredProfiles.alpha = createParsedConfig(
      'alpha',
      {
        '.ts': 'typescript',
      },
      ['--stdio', '--from-reload']
    );
    configuredProfiles.beta = createParsedConfig(
      'beta',
      {
        '.ts': 'typescript',
      },
      ['--stdio', '--dormant']
    );

    const status = await manager.reload();
    const alphaRecord = sessionRecords.get('alpha');
    const betaRecord = sessionRecords.get('beta');

    expect(alphaRecord?.stopMock).toHaveBeenCalledTimes(1);
    expect(alphaRecord?.startMock).toHaveBeenCalledTimes(2);
    expect(betaRecord?.stopMock).not.toHaveBeenCalled();
    expect(betaRecord?.startMock).not.toHaveBeenCalled();
    expect(
      status.profiles.find((profile) => profile.name === 'alpha')
    ).toMatchObject({
      state: 'ready',
      commandArgs: ['--stdio', '--from-reload'],
    });
    expect(
      status.profiles.find((profile) => profile.name === 'beta')
    ).toMatchObject({
      state: 'not_started',
      commandArgs: ['--stdio', '--dormant'],
    });
  });

  it('reload does not restart profiles that were removed from config', async () => {
    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    await manager.start('alpha');
    delete configuredProfiles.alpha;

    const status = await manager.reload();
    const alphaRecord = sessionRecords.get('alpha');

    expect(alphaRecord?.stopMock).toHaveBeenCalledTimes(1);
    expect(alphaRecord?.startMock).toHaveBeenCalledTimes(1);
    expect(status.profiles.find((profile) => profile.name === 'alpha')).toBeUndefined();
    expect(
      status.profiles.find((profile) => profile.name === 'beta')
    ).toMatchObject({
      state: 'not_started',
    });
  });

  it('starts in uninitialized mode without a config file and reports bootstrap guidance', async () => {
    mockLoadLspConfig.mockReturnValue({
      config: {
        'language-servers': {},
      },
      source: {
        path: 'default',
        type: 'default',
        description: 'Using default configuration (no config file found)',
      },
    });
    mockAutoDetectLsp.mockReturnValue(null);
    mockGetLspConfig.mockReturnValue(null);

    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    const status = manager.getStatus();

    expect(status).toMatchObject({
      mode: 'start',
      state: 'uninitialized',
      configPath: null,
      profiles: [],
    });
    expect(status.issues).toContain(
      'No configuration file was found. Run `symbols config init` to create language-servers.yaml, then add a language server profile, or start Symbols in direct mode with `symbols run <command>`.'
    );
  });

  it('short-circuits file routing when no config file is present', async () => {
    mockLoadLspConfig.mockReturnValue({
      config: {
        'language-servers': {},
      },
      source: {
        path: 'default',
        type: 'default',
        description: 'Using default configuration (no config file found)',
      },
    });
    mockAutoDetectLsp.mockReturnValue(null);
    mockGetLspConfig.mockReturnValue(null);

    const manager = createLspManager();
    await manager.configureForStart({
      command: 'start',
      workspace: workspacePath,
    } as StartCommandArgs);

    await expect(manager.getSessionForFile('src/test.ts')).rejects.toThrow(
      'No configuration file was found. Run `symbols config init` to create language-servers.yaml, then add a language server profile, or start Symbols in direct mode with `symbols run <command>`.'
    );
    await expect(manager.getSearchSessions()).rejects.toThrow(
      'No configuration file was found. Run `symbols config init` to create language-servers.yaml, then add a language server profile, or start Symbols in direct mode with `symbols run <command>`.'
    );
  });
});
