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

export class McpTestClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor(
    private command = 'pnpm',
    private args = ['start'],
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
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Connection timeout after ${timeoutMs}ms (working dir: ${this.workingDirectory || 'default'})`
          )
        );
      }, timeoutMs);

      this.client
        .connect(this.transport)
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch(reject);
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

      if (debug) {
        console.log(`[DEBUG] Tool '${name}' result:`, {
          isError: Boolean(result.isError),
          contentType: typeof result.content,
          contentLength: Array.isArray(result.content)
            ? result.content.length
            : 'not array',
          content: result.content,
        });
      }

      return {
        content: result.content,
        isError: Boolean(result.isError),
      };
    } catch (error) {
      if (debug) {
        console.error(`[DEBUG] Tool '${name}' threw error:`, error);
      }

      return {
        content: error,
        isError: true,
      };
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

  async getCompletion(
    position: SymbolPosition,
    debug = false
  ): Promise<ToolCallResult> {
    return this.callTool('completion', { ...position }, debug);
  }

  async getDiagnostics(
    file: string,
    maxDepth?: number,
    previewMode?: string,
    debug = false
  ): Promise<ToolCallResult> {
    const args: Record<string, unknown> = { file };
    if (maxDepth !== undefined) args.maxDepth = maxDepth;
    if (previewMode) args.previewMode = previewMode;
    return this.callTool('diagnostics', args, debug);
  }

  async readSymbols(
    file: string,
    maxDepth?: number,
    previewMode?: string,
    debug = false
  ): Promise<ToolCallResult> {
    const args: Record<string, unknown> = { file };
    if (maxDepth !== undefined) args.maxDepth = maxDepth;
    if (previewMode) args.previewMode = previewMode;
    return this.callTool('read', args, debug);
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

  async getLogs(): Promise<ToolCallResult> {
    return this.callTool('logs', {});
  }
}
