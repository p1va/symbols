import { describe, expect, it } from 'vitest';
import {
  buildLanguageServerDetailResource,
  buildLanguageServersSummaryResource,
} from '../../src/resources/language-servers.js';
import type {
  LspManagerProfileStatus,
  LspManagerStatus,
} from '../../src/runtime/lsp-manager.js';
import { formatWindowLogMessages } from '../../src/utils/window-logs.js';
import { validateSetup } from '../../src/tools/validation.js';

function createProfileStatus(
  overrides: Partial<LspManagerProfileStatus> = {}
): LspManagerProfileStatus {
  return {
    name: 'csharp',
    sessionKey: 'csharp::/workspace',
    configured: true,
    state: 'ready',
    command:
      '/home/truelayer/.csharp-lsp/csharp-ls --stdio --log-level Information',
    commandName: '/home/truelayer/.csharp-lsp/csharp-ls',
    commandArgs: ['--stdio', '--log-level', 'Information'],
    workspacePath: '/workspace',
    workspaceFiles: ['*.sln', '*.csproj'],
    isDefault: true,
    lastError: null,
    pid: 1234,
    extensions: ['.cs'],
    preloadFiles: ['Program.cs'],
    diagnosticsStrategy: 'pull',
    workspaceLoader: 'roslyn',
    workspaceReady: true,
    workspaceLoading: false,
    windowLogCount: 2,
    ownedDocumentCount: 1,
    ...overrides,
  };
}

function createManagerStatus(
  profileOverrides: Partial<LspManagerProfileStatus> = {}
): LspManagerStatus {
  return {
    mode: 'start',
    state: 'ready',
    workspacePath: '/workspace',
    configPath: '/home/truelayer/.config/symbols/language-servers.yaml',
    defaultProfileName: 'csharp',
    detectedProfileName: 'csharp',
    issues: [],
    profiles: [createProfileStatus(profileOverrides)],
  };
}

describe('language server resources', () => {
  it('builds a structured summary with config and runtime sections', () => {
    const status = createManagerStatus();

    const summary = buildLanguageServersSummaryResource(status);

    expect(summary.manager.configPath).toBe(
      '/home/truelayer/.config/symbols/language-servers.yaml'
    );
    expect(summary.manager).toMatchObject({
      mode: 'start',
      state: 'ready',
      defaultProfileName: 'csharp',
      detectedProfileName: 'csharp',
      issues: [],
    });
    expect(summary.profiles).toHaveLength(1);
    expect(summary.profiles[0]).toMatchObject({
      name: 'csharp',
      config: {
        command:
          '/home/truelayer/.csharp-lsp/csharp-ls --stdio --log-level Information',
        launch: {
          commandName: '/home/truelayer/.csharp-lsp/csharp-ls',
          commandArgs: ['--stdio', '--log-level', 'Information'],
        },
        workspaceFiles: ['*.sln', '*.csproj'],
        preloadFiles: ['Program.cs'],
        diagnosticsStrategy: 'pull',
      },
      runtime: {
        state: 'ready',
        pid: 1234,
        workspaceReady: true,
        ownedDocumentCount: 1,
      },
    });
  });

  it('builds detail hints for broken runtime state', () => {
    const status = createManagerStatus({
      state: 'error',
      lastError: 'spawn ENOENT',
      workspaceReady: false,
      windowLogCount: 1,
      ownedDocumentCount: 0,
    });

    const detail = buildLanguageServerDetailResource(
      status,
      status.profiles[0]
    );

    expect(detail.hints).toContain(
      'Session is in an error state. Check the logs resource, then verify the configured command and install path.'
    );
    expect(detail.hints).toContain(
      'After fixing config, call setup reload and then rerun an LSP-backed tool.'
    );
    expect(detail.hints).toContain(
      'Recent window log messages are available via the logs resource.'
    );
  });

  it('does not report workspace readiness hints for a never-started session', () => {
    const status = createManagerStatus({
      state: 'not_started',
      workspaceReady: null,
      workspaceLoading: null,
      preloadFiles: ['Program.cs'],
      ownedDocumentCount: 0,
    });

    const detail = buildLanguageServerDetailResource(
      status,
      status.profiles[0]
    );

    expect(detail.hints).toEqual([
      'Session has not been started yet. Run an LSP-backed tool on a matching file to launch it.',
    ]);
    expect(detail.runtime.workspaceReady).toBeNull();
    expect(detail.runtime.workspaceLoading).toBeNull();
  });

  it('reports explicit relaunch guidance for a stopped session', () => {
    const status = createManagerStatus({
      state: 'stopped',
      workspaceReady: null,
      workspaceLoading: null,
    });

    const detail = buildLanguageServerDetailResource(
      status,
      status.profiles[0]
    );

    expect(detail.hints).toEqual([
      'Session was stopped. Run an LSP-backed tool on a matching file to launch it again.',
    ]);
  });
});

describe('window log formatting', () => {
  it('formats contextual log lines for agents', () => {
    const formatted = formatWindowLogMessages([
      {
        type: 3,
        message: '[csharp] Workspace loaded successfully',
      },
    ]);

    expect(formatted).toBe(
      'ℹ [Info] [csharp] Workspace loaded successfully'
    );
  });
});

describe('setup validation', () => {
  it('defaults setup to reload', () => {
    expect(validateSetup({})).toEqual({
      action: 'reload',
    });
  });
});
