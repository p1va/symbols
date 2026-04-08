import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  LspManager,
  LspManagerProfileStatus,
  LspManagerStatus,
} from '../runtime/lsp-manager.js';
import * as LspOperations from '../lsp/operations/index.js';
import { formatWindowLogMessages } from '../utils/window-logs.js';

interface LanguageServerStatusResource {
  manager: {
    mode: LspManagerStatus['mode'];
    state: LspManagerStatus['state'];
    workspacePath: string;
    configPath: string | null;
    defaultProfileName: string | null;
    detectedProfileName: string | null;
    issues: string[];
  };
  profiles: LanguageServerProfileResource[];
}

interface LanguageServerProfileResource {
  name: string;
  config: {
    configured: boolean;
    command: string;
    launch: {
      commandName: string;
      commandArgs: string[];
    };
    workspacePath: string;
    workspaceFiles: string[];
    extensions: string[];
    preloadFiles: string[];
    diagnosticsStrategy: 'push' | 'pull';
    workspaceLoader: string | null;
    isDefault: boolean;
  };
  runtime: {
    sessionKey: string;
    state: string;
    pid: number | null;
    lastError: string | null;
    workspaceReady: boolean | null;
    workspaceLoading: boolean | null;
    windowLogCount: number;
    ownedDocumentCount: number;
  };
}

interface LanguageServerProfileDetailResource
  extends LanguageServerProfileResource {
  configPath: string | null;
  mode: LspManagerStatus['mode'];
  hints: string[];
}

function toLanguageServerProfileResource(
  profile: LspManagerProfileStatus
): LanguageServerProfileResource {
  return {
    name: profile.name,
    config: {
      configured: profile.configured,
      command: profile.command,
      launch: {
        commandName: profile.commandName,
        commandArgs: [...profile.commandArgs],
      },
      workspacePath: profile.workspacePath,
      workspaceFiles: [...profile.workspaceFiles],
      extensions: [...profile.extensions],
      preloadFiles: [...profile.preloadFiles],
      diagnosticsStrategy: profile.diagnosticsStrategy,
      workspaceLoader: profile.workspaceLoader,
      isDefault: profile.isDefault,
    },
    runtime: {
      sessionKey: profile.sessionKey,
      state: profile.state,
      pid: profile.pid,
      lastError: profile.lastError,
      workspaceReady: profile.workspaceReady,
      workspaceLoading: profile.workspaceLoading,
      windowLogCount: profile.windowLogCount,
      ownedDocumentCount: profile.ownedDocumentCount,
    },
  };
}

function buildHints(profile: LspManagerProfileStatus): string[] {
  const hints: string[] = [];

  if (!profile.configured) {
    hints.push(
      'This session is no longer present in the active config file. Stop it or re-add the profile to language-servers.yaml.'
    );
  }

  if (profile.state === 'not_started') {
    hints.push(
      'Session has not been started yet. Run an LSP-backed tool on a matching file to launch it.'
    );
    return hints;
  }

  if (profile.state === 'stopped') {
    hints.push(
      'Session was stopped. Run an LSP-backed tool on a matching file to launch it again.'
    );
    return hints;
  }

  if (profile.state === 'error') {
    hints.push(
      'Session is in an error state. Check the logs resource, then verify the configured command and install path.'
    );
    hints.push(
      'After fixing config, call reload and then rerun an LSP-backed tool.'
    );
  }

  if (profile.workspaceLoading) {
    hints.push(
      'Workspace is still loading. Retry file-based operations after initialization completes.'
    );
  }

  if (!profile.workspaceReady && !profile.workspaceLoading) {
    hints.push(
      'Workspace is not ready yet. Check logs and workspace loader settings.'
    );
  }

  if (profile.windowLogCount > 0) {
    hints.push(
      'Recent window log messages are available via the logs resource.'
    );
  }

  if (profile.preloadFiles.length > 0 && profile.ownedDocumentCount === 0) {
    hints.push(
      'This profile configures preload files or patterns, but none are currently owned by the live session. Check that at least one entry matches a real file in this workspace.'
    );
  }

  if (hints.length === 0) {
    hints.push('Configuration and runtime state look healthy.');
  }

  return hints;
}

export function buildLanguageServersSummaryResource(
  status: LspManagerStatus
): LanguageServerStatusResource {
  return {
    manager: {
      mode: status.mode,
      state: status.state,
      workspacePath: status.workspacePath,
      configPath: status.configPath,
      defaultProfileName: status.defaultProfileName,
      detectedProfileName: status.detectedProfileName,
      issues: [...status.issues],
    },
    profiles: status.profiles
      .map((profile) => toLanguageServerProfileResource(profile))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function buildLanguageServerDetailResource(
  status: LspManagerStatus,
  profile: LspManagerProfileStatus
): LanguageServerProfileDetailResource {
  return {
    ...toLanguageServerProfileResource(profile),
    configPath: status.configPath,
    mode: status.mode,
    hints: buildHints(profile),
  };
}

function createJsonResource(uri: string, payload: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function createTextResource(uri: string, text: string) {
  return {
    contents: [
      {
        uri,
        mimeType: 'text/plain',
        text,
      },
    ],
  };
}

function listProfileUris(
  manager: LspManager,
  buildUri: (profileName: string) => string
) {
  return {
    resources: manager.listProfiles().map((profile) => ({
      uri: buildUri(profile.name),
      name: profile.name,
    })),
  };
}

function getProfileOrThrow(
  manager: LspManager,
  profileName: string
): LspManagerProfileStatus {
  const profile = manager.getProfileStatus(profileName);
  if (!profile) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Language server '${profileName}' not found`
    );
  }

  return profile;
}

export function registerLanguageServerResources(
  server: McpServer,
  manager: LspManager
): void {
  server.registerResource(
    'language-server-profiles',
    'language-servers://profiles',
    {
      title: 'Language Server Profiles',
      description:
        'Manager status plus effective language-server configuration overlaid with runtime state for all configured profiles.',
      mimeType: 'application/json',
    },
    (uri) =>
      createJsonResource(
        uri.toString(),
        buildLanguageServersSummaryResource(manager.getStatus())
      )
  );

  server.registerResource(
    'language-server-profile',
    new ResourceTemplate('language-servers://profiles/{name}', {
      list: () =>
        listProfileUris(
          manager,
          (profileName) =>
            `language-servers://profiles/${encodeURIComponent(profileName)}`
        ),
    }),
    {
      title: 'Language Server Profile',
      description:
        'Detailed view of one configured language-server profile and its runtime state.',
      mimeType: 'application/json',
    },
    (uri, variables) => {
      const profileName = decodeURIComponent(String(variables.name ?? ''));
      const status = manager.getStatus();
      const profile = getProfileOrThrow(manager, profileName);
      return createJsonResource(
        uri.toString(),
        buildLanguageServerDetailResource(status, profile)
      );
    }
  );

  server.registerResource(
    'language-server-logs',
    new ResourceTemplate('language-servers://profiles/{name}/logs', {
      list: () =>
        listProfileUris(
          manager,
          (profileName) =>
            `language-servers://profiles/${encodeURIComponent(profileName)}/logs`
        ),
    }),
    {
      title: 'Language Server Logs',
      description:
        'Recent LSP window/log messages for one configured language-server profile.',
      mimeType: 'text/plain',
    },
    (uri, variables) => {
      const profileName = decodeURIComponent(String(variables.name ?? ''));
      const profile = getProfileOrThrow(manager, profileName);
      const sessions = manager.getStartedSessions(profileName);

      if (sessions.length === 0) {
        const lines = [
          `Profile: ${profileName}`,
          `State: ${profile.state}`,
          `Running: no`,
        ];

        if (profile.lastError) {
          lines.push(`Last error: ${profile.lastError}`);
        }

        lines.push(
          'Run an LSP-backed tool on a matching file to launch the server.'
        );

        return createTextResource(uri.toString(), lines.join('\n'));
      }

      const sections: string[] = [];
      for (const session of sessions) {
        const result = LspOperations.logs(session);
        if (!result.ok) {
          sections.push(`Profile: ${profileName}\n${result.error.message}`);
          continue;
        }

        sections.push(
          `Profile: ${profileName}\n${formatWindowLogMessages(result.data)}`
        );
      }

      return createTextResource(uri.toString(), sections.join('\n\n'));
    }
  );
}
