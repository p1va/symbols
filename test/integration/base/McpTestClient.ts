import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export interface ToolCallResult {
  content: unknown;
  isError: boolean;
}

export interface SymbolPosition {
  file: string;
  line: number;
  character: number;
}

const TOOL_RETRY_TIMEOUT_MS = 15000;
const TOOL_RETRY_POLL_MS = 250;
const WORKSPACE_LOADING_MESSAGE_PREFIX = 'Workspace is still loading';

function isTextItem(item: unknown): item is { text: string } {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const record = item as Record<string, unknown>;
  return typeof record.text === 'string';
}

function isMessageItem(item: unknown): item is { message: string } {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const record = item as Record<string, unknown>;
  return typeof record.message === 'string';
}

function extractToolText(content: unknown): string {
  if (content instanceof Error) {
    return content.message;
  }

  if (!Array.isArray(content)) {
    if (typeof content === 'string') {
      return content;
    }

    if (isMessageItem(content)) {
      return content.message;
    }

    return JSON.stringify(content);
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (isTextItem(item)) {
        return item.text;
      }

      return JSON.stringify(item);
    })
    .join('\n');
}

function shouldRetryForWorkspaceLoading(result: ToolCallResult): boolean {
  if (!result.isError) {
    return false;
  }

  return extractToolText(result.content).startsWith(
    WORKSPACE_LOADING_MESSAGE_PREFIX
  );
}

export class McpTestClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor(
    private command = 'node',
    private args = ['dist/index.js', 'start'],
    private name = 'integration-test',
    private version = '1.0.0',
    private workingDirectory?: string,
    private configPath?: string
  ) {
    // Add --workspace argument when working directory is specified
    let finalArgs = this.workingDirectory
      ? [...this.args, '--workspace', this.workingDirectory]
      : this.args;

    // Add --config argument when config path is specified
    if (this.configPath) {
      finalArgs = [...finalArgs, '--config', this.configPath];
    }

    finalArgs = [...finalArgs, '--loglevel', 'debug'];

    // Log the command being executed for debugging
    console.log(
      `[McpTestClient] Starting MCP server: ${this.command} ${finalArgs.join(' ')}`
    );
    if (this.workingDirectory) {
      console.log(
        `[McpTestClient] Working directory: ${this.workingDirectory}`
      );
    }
    if (this.configPath) {
      console.log(`[McpTestClient] Config path: ${this.configPath}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      command: this.command,
      args: finalArgs,
    };

    // Don't change the working directory of the MCP server process
    // The --workspace argument tells the server which workspace to use
    // but the server itself should run from the main repo directory

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.transport = new StdioClientTransport(config);
    this.client = new Client({ name: this.name, version: this.version });
  }

  async connect(timeoutMs = 15000): Promise<void> {
    console.log(
      `[McpTestClient] Attempting to connect with ${timeoutMs}ms timeout...`
    );

    return new Promise((resolve, reject) => {
      let isResolved = false;
      const stderrChunks: string[] = [];

      // Set up stderr capture if possible
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const childProcess = (this.transport as any)._process;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (childProcess && childProcess.stderr) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          childProcess.stderr.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stderrChunks.push(chunk);
            console.log(`[McpTestClient] STDERR: ${chunk.trim()}`);
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          childProcess.on(
            'exit',
            (code: number | null, signal: string | null) => {
              if (!isResolved) {
                console.log(
                  `[McpTestClient] Process exited with code: ${code}, signal: ${signal}`
                );
                if (stderrChunks.length > 0) {
                  console.log(
                    `[McpTestClient] Captured stderr: ${stderrChunks.join('')}`
                  );
                }
              }
            }
          );

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          childProcess.on('error', (error: Error) => {
            console.log(`[McpTestClient] Process error: ${error.message}`);
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeout);
              reject(new Error(`Process error: ${error.message}`));
            }
          });
        }
      } catch (error) {
        console.log(
          `[McpTestClient] Could not access child process for stderr capture: ${String(error)}`
        );
      }

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          const stderrOutput =
            stderrChunks.length > 0
              ? `\nStderr output: ${stderrChunks.join('')}`
              : '\nNo stderr output captured';
          reject(
            new Error(
              `Connection timeout after ${timeoutMs}ms\n` +
                `Command: ${this.command} ${this.args.join(' ')}\n` +
                `Working dir: ${this.workingDirectory || 'default'}\n` +
                `Config: ${this.configPath || 'default'}${stderrOutput}`
            )
          );
        }
      }, timeoutMs);

      this.client
        .connect(this.transport)
        .then(() => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            console.log(`[McpTestClient] Successfully connected to MCP server`);
            resolve();
          }
        })
        .catch((error: unknown) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            const stderrOutput =
              stderrChunks.length > 0
                ? `\nStderr output: ${stderrChunks.join('')}`
                : '\nNo stderr output captured';
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(`[McpTestClient] Connection failed: ${errorMessage}`);
            reject(
              new Error(
                `MCP connection failed: ${errorMessage}\n` +
                  `Command: ${this.command} ${this.args.join(' ')}\n` +
                  `Working dir: ${this.workingDirectory || 'default'}\n` +
                  `Config: ${this.configPath || 'default'}${stderrOutput}`
              )
            );
          }
        });
    });
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    debug = false
  ): Promise<ToolCallResult> {
    const startedAt = Date.now();

    while (true) {
      try {
        if (debug) {
          console.log(
            `[DEBUG] Calling tool '${name}' with args:`,
            JSON.stringify(args, null, 2)
          );
        }

        const result = await this.client.callTool({
          name,
          arguments: args,
        });

        const toolResult = {
          content: result.content,
          isError: Boolean(result.isError),
        };

        if (debug) {
          console.log(`[DEBUG] Tool '${name}' result:`, {
            isError: toolResult.isError,
            contentType: typeof toolResult.content,
            contentLength: Array.isArray(toolResult.content)
              ? toolResult.content.length
              : 'not array',
            content: toolResult.content,
          });
        }

        const timedOut = Date.now() - startedAt >= TOOL_RETRY_TIMEOUT_MS;
        if (!timedOut && shouldRetryForWorkspaceLoading(toolResult)) {
          await new Promise((resolve) =>
            setTimeout(resolve, TOOL_RETRY_POLL_MS)
          );
          continue;
        }

        return toolResult;
      } catch (error) {
        const toolResult = {
          content: error,
          isError: true,
        };

        const timedOut = Date.now() - startedAt >= TOOL_RETRY_TIMEOUT_MS;
        if (!timedOut && shouldRetryForWorkspaceLoading(toolResult)) {
          await new Promise((resolve) =>
            setTimeout(resolve, TOOL_RETRY_POLL_MS)
          );
          continue;
        }

        if (debug) {
          console.error(`[DEBUG] Tool '${name}' threw error:`, error);
        }

        return toolResult;
      }
    }
  }

  // Convenience methods for specific tools
  async inspect(
    position: SymbolPosition,
    debug = false
  ): Promise<ToolCallResult> {
    return this.callTool('inspect', { ...position }, debug);
  }

  async getReferences(
    position: SymbolPosition,
    debug = false
  ): Promise<ToolCallResult> {
    return this.callTool('references', { ...position }, debug);
  }

  async getCallHierarchy(
    position: SymbolPosition,
    direction: 'incoming' | 'outgoing' | 'both' = 'both',
    debug = false
  ): Promise<ToolCallResult> {
    return this.callTool('call_hierarchy', { ...position, direction }, debug);
  }

  async getCompletion(
    position: SymbolPosition,
    debug = false
  ): Promise<ToolCallResult> {
    return this.callTool('completion', { ...position }, debug);
  }

  async getDiagnostics(
    file: string,
    preview?: boolean,
    debug = false
  ): Promise<ToolCallResult> {
    const args: Record<string, unknown> = { file };
    if (preview !== undefined) args.preview = preview;
    return this.callTool('diagnostics', args, debug);
  }

  async outline(
    file: string,
    preview?: boolean,
    debug = false
  ): Promise<ToolCallResult> {
    const args: Record<string, unknown> = { file };
    if (preview !== undefined) args.preview = preview;
    return this.callTool('outline', args, debug);
  }

  async searchSymbols(query: string): Promise<ToolCallResult> {
    return this.callTool('search', { query });
  }

  async renameSymbol(
    position: SymbolPosition,
    newName: string
  ): Promise<ToolCallResult> {
    return this.callTool('rename', { ...position, newName });
  }
}
