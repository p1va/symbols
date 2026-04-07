import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  LspManager,
  LspManagerProfileStatus,
  LspManagerStatus,
} from '../runtime/lsp-manager.js';
import { setupSchema } from './schemas.js';
import { validateSetup } from './validation.js';

function formatProfileSummary(profile: LspManagerProfileStatus): string {
  const workspaceReadyText =
    profile.workspaceReady === null
      ? 'n/a'
      : profile.workspaceReady
        ? 'yes'
        : 'no';
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
    `  workspace ready: ${workspaceReadyText}`,
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
        'Reload the effective config and reapply it to currently running LSP sessions.',
      inputSchema: setupSchema,
    },
    async (request) => {
      validateSetup(request);
      const status = await manager.reload();
      return {
        content: [{ type: 'text' as const, text: formatStatus(status) }],
      };
    }
  );
}
