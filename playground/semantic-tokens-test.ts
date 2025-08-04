/**
 * Semantic Tokens LSP Request Test
 *
 * This tests the textDocument/semanticTokens/full request to see what kind of semantic
 * information the TypeScript language server provides. This should give us more detailed
 * token classification beyond just document symbols.
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
import * as fs from 'fs';

console.log('--- Testing Semantic Tokens ---');

async function testSemanticTokens() {
  console.log('🚀 Starting Language Server for Semantic Tokens test...');

  // Spawn the TypeScript Language Server
  const serverProcess = cp.spawn('typescript-language-server', ['--stdio']);

  // Create JSON-RPC connection
  const connection = rpc.createMessageConnection(
    serverProcess.stdout,
    serverProcess.stdin
  );

  // Basic notification handlers
  connection.onNotification((method: string, params: any) => {
    if (method !== 'window/logMessage') {
      // Reduce noise
      console.log('📨 Notification:', method);
    }
  });

  connection.onRequest('client/registerCapability', (params: any) => {
    console.log('📋 Capability registration:', params);
    return {};
  });

  // Start listening
  connection.listen();

  // Initialize the server
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
            full: {
              delta: false,
            },
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
    console.log(
      '🔧 Semantic tokens capability:',
      initResult.capabilities?.semanticTokensProvider
    );

    // Send initialized notification
    await connection.sendNotification('initialized', {});

    // Test with an existing TypeScript file that has various constructs
    const testFilePath = path.join(workspaceFolder, 'src', 'index.ts');
    const testFileUri = `file://${testFilePath}`;

    // Check if file exists, if not use a different one
    let fileContent: string;
    let actualTestFilePath: string;

    if (fs.existsSync(testFilePath)) {
      fileContent = fs.readFileSync(testFilePath, 'utf-8');
      actualTestFilePath = testFilePath;
    } else {
      // Use this playground file itself as test subject
      actualTestFilePath = __filename;
      fileContent = fs.readFileSync(__filename, 'utf-8');
    }

    const actualTestFileUri = `file://${actualTestFilePath}`;

    console.log(`\n📂 Opening document: ${actualTestFileUri}`);
    console.log(`📄 File content preview (first 200 chars):`);
    console.log(fileContent.substring(0, 200) + '...');

    const didOpenParams: DidOpenTextDocumentParams = {
      textDocument: {
        uri: actualTestFileUri,
        languageId: 'typescript',
        version: 1,
        text: fileContent,
      },
    };
    await connection.sendNotification('textDocument/didOpen', didOpenParams);

    // Wait for server processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Request semantic tokens
    console.log('\n🎨 Requesting semantic tokens...');
    const semanticTokensParams: SemanticTokensParams = {
      textDocument: {
        uri: actualTestFileUri,
      } as TextDocumentIdentifier,
    };

    try {
      const semanticTokens = await connection.sendRequest(
        'textDocument/semanticTokens/full',
        semanticTokensParams
      );

      console.log('\n✅ Semantic tokens received:');
      console.log(
        '🔢 Raw data length:',
        (semanticTokens as any)?.data?.length || 0
      );

      if ((semanticTokens as any)?.data) {
        console.log(
          '📊 First 20 token values:',
          (semanticTokens as any).data.slice(0, 20)
        );

        // Decode the first few tokens to show the format
        console.log('\n🔍 Decoding first few tokens:');
        const data = (semanticTokens as any).data;

        // Token types from our capability
        const tokenTypes = [
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
        ];

        const tokenModifiers = [
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
        ];

        // Decode relative tokens format: [deltaLine, deltaStart, length, tokenType, tokenModifiers]
        let currentLine = 0;
        let currentChar = 0;

        for (let i = 0; i < Math.min(data.length, 25); i += 5) {
          const deltaLine = data[i];
          const deltaStart = data[i + 1];
          const length = data[i + 2];
          const tokenType = data[i + 3];
          const tokenModifiersBits = data[i + 4];

          currentLine += deltaLine;
          currentChar = deltaLine === 0 ? currentChar + deltaStart : deltaStart;

          // Extract text at this position
          const lines = fileContent.split('\n');
          const tokenText =
            lines[currentLine]?.substring(currentChar, currentChar + length) ||
            '???';

          const modifiersList = [];
          for (let bit = 0; bit < tokenModifiers.length; bit++) {
            if (tokenModifiersBits & (1 << bit)) {
              modifiersList.push(tokenModifiers[bit]);
            }
          }

          console.log(
            `  Token ${i / 5 + 1}: "${tokenText}" at line ${currentLine + 1}, char ${currentChar + 1}`
          );
          console.log(
            `    Type: ${tokenTypes[tokenType] || 'unknown'} (${tokenType})`
          );
          console.log(
            `    Modifiers: [${modifiersList.join(', ')}] (${tokenModifiersBits})`
          );
          console.log('');
        }
      } else {
        console.log('❌ No semantic tokens data received');
      }
    } catch (error) {
      console.log('❌ Semantic tokens request failed:', error);
    }

    // Close the document
    console.log('\n📄 Closing document...');
    const didCloseParams: DidCloseTextDocumentParams = {
      textDocument: {
        uri: actualTestFileUri,
      } as TextDocumentIdentifier,
    };
    await connection.sendNotification('textDocument/didClose', didCloseParams);

    // Stop the server
    console.log('🛑 Stopping server...');
    await connection.sendRequest('shutdown', null);
    await connection.sendNotification('exit', null);
    serverProcess.kill();

    console.log('👋 Test completed.');
  } catch (error) {
    console.error('❌ Error:', error);
    serverProcess.kill();
  }
}

testSemanticTokens();
