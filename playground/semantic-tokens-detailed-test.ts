/**
 * Detailed Semantic Tokens Test
 *
 * Tests semantic tokens with various TypeScript constructs to understand
 * how different symbols are classified, especially const declarations vs function calls.
 */

import * as cp from 'child_process';
import * as rpc from 'vscode-jsonrpc';
import {
  InitializeParams,
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
  TextDocumentIdentifier,
  WorkspaceFolder,
  SemanticTokensParams,
} from 'vscode-languageserver-protocol';
import * as path from 'path';

console.log('--- Detailed Semantic Tokens Test ---');

// Test content with various TypeScript constructs
const testContent = `interface User {
  name: string;
  age: number;
}

class UserService {
  private users: User[] = [];
  
  constructor() {}
  
  async addUser(user: User): Promise<void> {
    this.users.push(user);
  }
  
  getUsers(): User[] {
    return this.users;
  }
}

function createService(): UserService {
  return new UserService();
}

// This is the interesting case: const declaration with function call
const service = createService();
const result = service.getUsers();
const name = result[0]?.name;

// More examples
const isReady = true;
const count = 42;
const message = "hello";

enum Status {
  PENDING = "pending",
  DONE = "done"
}

type ServiceConfig = {
  timeout: number;
  retries: number;
};

export { UserService, Status };
export default service;
`;

async function detailedSemanticTokensTest() {
  console.log(
    '🚀 Starting Language Server for detailed semantic tokens test...'
  );

  const serverProcess = cp.spawn('typescript-language-server', ['--stdio']);
  const connection = rpc.createMessageConnection(
    serverProcess.stdout,
    serverProcess.stdin
  );

  // Minimal notification handling
  connection.onNotification((method: string, params: any) => {
    if (
      method.includes('logMessage') &&
      (params as any)?.message?.includes('error')
    ) {
      console.log('⚠️  Error message:', (params as any).message);
    }
  });

  connection.onRequest('client/registerCapability', () => ({}));
  connection.listen();

  const workspaceFolder = process.cwd();
  const initParams: InitializeParams = {
    processId: process.pid,
    rootUri: `file://${workspaceFolder}`,
    workspaceFolders: [
      {
        name: path.basename(workspaceFolder),
        uri: `file://${workspaceFolder}`,
      } as WorkspaceFolder,
    ],
    capabilities: {
      textDocument: {
        semanticTokens: {
          dynamicRegistration: true,
          requests: {
            range: false,
            full: { delta: false },
          },
          tokenTypes: [
            'namespace',
            'type',
            'class',
            'enum',
            'interface',
            'struct',
            'typeParameter',
            'parameter',
            'variable',
            'property',
            'enumMember',
            'event',
            'function',
            'method',
            'macro',
            'keyword',
            'modifier',
            'comment',
            'string',
            'number',
            'regexp',
            'operator',
            'decorator',
          ],
          tokenModifiers: [
            'declaration',
            'definition',
            'readonly',
            'static',
            'deprecated',
            'abstract',
            'async',
            'modification',
            'documentation',
            'defaultLibrary',
          ],
          formats: ['relative'],
        },
        synchronization: {
          didSave: true,
        },
      },
    },
  };

  try {
    const initResult = (await connection.sendRequest(
      'initialize',
      initParams
    )) as any;
    console.log('✅ Server initialized');

    // Get actual token types from server
    const serverTokenTypes =
      initResult.capabilities?.semanticTokensProvider?.legend?.tokenTypes || [];
    const serverTokenModifiers =
      initResult.capabilities?.semanticTokensProvider?.legend?.tokenModifiers ||
      [];

    console.log('🏷️  Server token types:', serverTokenTypes);
    console.log('🔧 Server token modifiers:', serverTokenModifiers);

    await connection.sendNotification('initialized', {});

    // Use a test file with our content
    const testFileUri = `file://${workspaceFolder}/test-semantic-tokens.ts`;

    console.log(`\n📂 Opening test document with content:`);
    console.log('---');
    console.log(testContent);
    console.log('---');

    const didOpenParams: DidOpenTextDocumentParams = {
      textDocument: {
        uri: testFileUri,
        languageId: 'typescript',
        version: 1,
        text: testContent,
      },
    };
    await connection.sendNotification('textDocument/didOpen', didOpenParams);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Request semantic tokens
    console.log('\n🎨 Requesting semantic tokens...');
    const semanticTokensParams: SemanticTokensParams = {
      textDocument: {
        uri: testFileUri,
      } as TextDocumentIdentifier,
    };

    try {
      const semanticTokens = await connection.sendRequest(
        'textDocument/semanticTokens/full',
        semanticTokensParams
      );

      console.log('\n✅ Semantic tokens received');
      const data = (semanticTokens as any)?.data;

      if (data && data.length > 0) {
        console.log(`🔢 Total tokens: ${data.length / 5}`);

        // Decode ALL tokens to see the patterns
        const lines = testContent.split('\n');
        let currentLine = 0;
        let currentChar = 0;

        console.log('\n🔍 All decoded tokens:');
        console.log('='.repeat(80));

        for (let i = 0; i < data.length; i += 5) {
          const deltaLine = data[i];
          const deltaStart = data[i + 1];
          const length = data[i + 2];
          const tokenType = data[i + 3];
          const tokenModifiersBits = data[i + 4];

          currentLine += deltaLine;
          currentChar = deltaLine === 0 ? currentChar + deltaStart : deltaStart;

          const tokenText =
            lines[currentLine]?.substring(currentChar, currentChar + length) ||
            '???';

          const modifiersList = [];
          for (let bit = 0; bit < serverTokenModifiers.length; bit++) {
            if (tokenModifiersBits & (1 << bit)) {
              modifiersList.push(serverTokenModifiers[bit]);
            }
          }

          const lineContent = lines[currentLine] || '';
          const tokenNumber = i / 5 + 1;

          console.log(
            `Token ${tokenNumber.toString().padStart(2)}: "${tokenText}" at line ${(currentLine + 1).toString().padStart(2)}, char ${(currentChar + 1).toString().padStart(2)}`
          );
          console.log(
            `    Type: ${(serverTokenTypes[tokenType] || 'unknown').padEnd(12)} (${tokenType})`
          );
          console.log(
            `    Modifiers: [${modifiersList.join(', ')}] (${tokenModifiersBits})`
          );
          console.log(`    Context: ${lineContent.trim()}`);
          console.log('');
        }

        // Highlight specific interesting tokens
        console.log('\n🎯 Key findings for const declarations:');
        console.log('='.repeat(50));

        currentLine = 0;
        currentChar = 0;

        for (let i = 0; i < data.length; i += 5) {
          const deltaLine = data[i];
          const deltaStart = data[i + 1];
          const length = data[i + 2];
          const tokenType = data[i + 3];
          const tokenModifiersBits = data[i + 4];

          currentLine += deltaLine;
          currentChar = deltaLine === 0 ? currentChar + deltaStart : deltaStart;

          const tokenText =
            lines[currentLine]?.substring(currentChar, currentChar + length) ||
            '???';
          const lineContent = lines[currentLine] || '';

          // Look for tokens on lines with "const" declarations
          if (
            lineContent.includes('const ') &&
            (tokenText === 'service' ||
              tokenText === 'result' ||
              tokenText === 'createService' ||
              tokenText === 'getUsers')
          ) {
            console.log(
              `🔍 "${tokenText}" -> ${serverTokenTypes[tokenType] || 'unknown'} [${serverTokenModifiers.filter((_, bit) => tokenModifiersBits & (1 << bit)).join(', ')}]`
            );
            console.log(`    Line: ${lineContent.trim()}`);
          }
        }
      } else {
        console.log('❌ No semantic tokens data received');
      }
    } catch (error) {
      console.log('❌ Semantic tokens request failed:', error);
    }

    // Cleanup
    const didCloseParams: DidCloseTextDocumentParams = {
      textDocument: { uri: testFileUri } as TextDocumentIdentifier,
    };
    await connection.sendNotification('textDocument/didClose', didCloseParams);

    await connection.sendRequest('shutdown', null);
    await connection.sendNotification('exit', null);
    serverProcess.kill();

    console.log('\n👋 Detailed test completed.');
  } catch (error) {
    console.error('❌ Error:', error);
    serverProcess.kill();
  }
}

detailedSemanticTokensTest();
