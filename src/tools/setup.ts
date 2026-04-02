import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  LspManager,
  LspManagerProfileStatus,
  LspManagerStatus,
} from '../runtime/lsp-manager.js';
import { setupSchema } from './schemas.js';
import { validateSetup } from './validation.js';

function formatProfileSummary(profile: LspManagerProfileStatus): string {
  const lines = [
    `${profile.name} [${profile.state}]${profile.isDefault ? ' default' : ''}`,
    `  session key: ${profile.sessionKey}`,
    `  command: ${profile.command}`,
    `  configured: ${profile.configured ? 'yes' : 'no'}`,
    `  workspace: ${profile.workspacePath}`,
    `  diagnostics: ${profile.diagnosticsStrategy}`,
    `  workspace loader: ${profile.workspaceLoader || 'default'}`,
    `  preload files: ${profile.preloadFiles.length > 0 ? profile.preloadFiles.join(', ') : 'none'}`,
    `  extensions: ${profile.extensions.length > 0 ? profile.extensions.join(', ') : 'none'}`,
    `  pid: ${profile.pid ?? 'not running'}`,
    `  workspace ready: ${profile.workspaceReady ? 'yes' : 'no'}`,
    `  window logs: ${profile.windowLogCount}`,
    `  owned documents: ${profile.ownedDocumentCount}`,
  ];

  if (profile.lastError) {
    lines.push(`  last error: ${profile.lastError}`);
  }

  return lines.join('\n');
}

function formatStatus(status: LspManagerStatus): string {
  const sections = [
    `Manager state: ${status.state}`,
    `Mode: ${status.mode || 'unconfigured'}`,
    `Workspace: ${status.workspacePath}`,
    `Config path: ${status.configPath || 'none'}`,
    `Default profile: ${status.defaultProfileName || 'none'}`,
    `Detected profile: ${status.detectedProfileName || 'none'}`,
  ];

  if (status.issues.length > 0) {
    sections.push(
      `Issues:\n${status.issues.map((issue) => `- ${issue}`).join('\n')}`
    );
  }

  if (status.profiles.length === 0) {
    sections.push('Profiles: none');
    return sections.join('\n\n');
  }

  sections.push(
    `Profiles:\n${status.profiles
      .map((profile) => formatProfileSummary(profile))
      .join('\n\n')}`
  );

  return sections.join('\n\n');
}

export function registerSetupTool(
  server: McpServer,
  manager: LspManager
): void {
  server.registerTool(
    'setup',
    {
      title: 'Setup',
      description:
        'Inspect and control LSP manager state. Supports status, detect, start, stop, restart, list_profiles, and show_profile.',
      inputSchema: setupSchema,
    },
    async (request) => {
      const validatedRequest = validateSetup(request);

      switch (validatedRequest.action) {
        case 'detect': {
          const status = await manager.detect();
          return {
            content: [{ type: 'text' as const, text: formatStatus(status) }],
          };
        }
        case 'start': {
          await manager.start(validatedRequest.profile);
          return {
            content: [
              {
                type: 'text' as const,
                text: formatStatus(manager.getStatus()),
              },
            ],
          };
        }
        case 'stop': {
          await manager.stop(validatedRequest.profile);
          return {
            content: [
              {
                type: 'text' as const,
                text: formatStatus(manager.getStatus()),
              },
            ],
          };
        }
        case 'restart': {
          await manager.restart(validatedRequest.profile);
          return {
            content: [
              {
                type: 'text' as const,
                text: formatStatus(manager.getStatus()),
              },
            ],
          };
        }
        case 'list_profiles': {
          const profiles = manager.listProfiles();
          const text =
            profiles.length === 0
              ? 'No LSP profiles are currently known to the manager.'
              : profiles
                  .map((profile) => formatProfileSummary(profile))
                  .join('\n\n');
          return {
            content: [{ type: 'text' as const, text }],
          };
        }
        case 'show_profile': {
          if (!validatedRequest.profile) {
            throw new Error('setup show_profile requires a profile name.');
          }

          const profile = manager.getProfileStatus(validatedRequest.profile);
          if (!profile) {
            throw new Error(
              `Unknown LSP profile '${validatedRequest.profile}'.`
            );
          }

          return {
            content: [
              { type: 'text' as const, text: formatProfileSummary(profile) },
            ],
          };
        }
        case 'status':
        default:
          return {
            content: [
              {
                type: 'text' as const,
                text: formatStatus(manager.getStatus()),
              },
            ],
          };
      }
    }
  );
}
