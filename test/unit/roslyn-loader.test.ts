import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LspClient, LspConfig } from '../../src/types.js';
import { detectCSharpWorkspace } from '../../src/utils/csharp-workspace.js';
import { createRoslynLoader } from '../../src/workspace/loaders/roslyn.js';

vi.mock('../../src/utils/csharp-workspace.js', () => ({
  detectCSharpWorkspace: vi.fn(),
  createCSharpWorkspaceNotification: vi.fn(),
}));

const mockDetectCSharpWorkspace = vi.mocked(detectCSharpWorkspace);

describe('Roslyn workspace loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectCSharpWorkspace.mockResolvedValue(null);
  });

  it('decodes the workspace file URI before detecting projects', async () => {
    const workspacePath = path.join(
      process.cwd(),
      'workspace with spaces',
      'café'
    );
    const config: LspConfig = {
      workspaceUri: pathToFileURL(workspacePath).href,
      workspaceName: 'café',
    };
    const client = {
      connection: {},
      isInitialized: true,
    } as LspClient;

    await createRoslynLoader().initialize(client, config);

    expect(mockDetectCSharpWorkspace).toHaveBeenCalledWith(workspacePath);
  });
});
