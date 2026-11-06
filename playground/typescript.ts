/**
 * TypeScript LSP Client Demo - Translation from C# PLAN.md
 *
 * This demonstrates how the C# LSP requests/notifications translate to TypeScript:
 *
 * 1. All LSP types are imported from 'vscode-languageserver-protocol'
 * 2. Notifications use: connection.sendNotification(NotificationType.type, params)
 * 3. Requests use: connection.sendRequest(RequestType.type, params)
 * 4. Server notifications: connection.onNotification(type, handler)
 * 5. Server requests: connection.onRequest(type, handler)
 *
 * Key advantages over manual type definitions:
 * - Built-in TypeScript types for all LSP messages
 * - Type safety for parameters and responses
 * - IntelliSense support
 * - Automatic JSON serialization/deserialization
 */

import * as cp from 'child_process';
import * as rpc from 'vscode-languageserver-protocol/node';
import {
  InitializeParams,
  DidOpenTextDocumentNotification,
  DidOpenTextDocumentParams,
  DidCloseTextDocumentNotification,
  DidCloseTextDocumentParams,
  DocumentSymbolRequest,
  DocumentSymbolParams,
  TextDocumentIdentifier,
  WorkspaceFolder,
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
} from 'vscode-languageserver-protocol';
import * as path from 'path';

console.log('--- Running ---');

async function runCli() {
  console.log('🚀 Starting Language Server Connection...');

  // Spawn the TypeScript Language Server
  const serverProcess = cp.spawn('typescript-language-server', ['--stdio']);

  // Create JSON-RPC connection using the overload that accepts streams directly
  const connection = rpc.createMessageConnection(
    serverProcess.stdout,
    serverProcess.stdin
  );

  // Set up notification handlers before listening
  connection.onNotification((method: string, params: any) => {
    console.log('📨 Notification received:', method, params);
  });

  // Specific handlers for notifications mentioned in PLAN.md
  connection.onNotification(
    'window/logMessage',
    (params: { type: number; message: string }) => {
      const logLevel =
        ['Error', 'Warning', 'Info', 'Log'][params.type - 1] || 'Unknown';
      console.log(`📝 [${logLevel}] ${params.message}`);
    }
  );

  connection.onNotification(
    'window/showMessage',
    (params: { type: number; message: string }) => {
      const messageType =
        ['Error', 'Warning', 'Info', 'Log'][params.type - 1] || 'Unknown';
      console.log(`💬 [${messageType}] ${params.message}`);
    }
  );

  // Handle diagnostics publication (from PLAN.md)
  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: PublishDiagnosticsParams) => {
      console.log(
        `🔍 Diagnostics for ${params.uri}:`,
        params.diagnostics.length,
        'issues'
      );
      params.diagnostics.forEach((diagnostic, index) => {
        console.log(
          `  ${index + 1}. [${diagnostic.severity || 'Unknown'}] ${diagnostic.message} at line ${diagnostic.range.start.line + 1}`
        );
      });
    }
  );

  // Handle capability registration requests (from PLAN.md)
  connection.onRequest('client/registerCapability', (params: any) => {
    console.log('📋 Server requesting capability registration:', params);
    return {}; // Return empty response to acknowledge
  });

  // Custom Roslyn/OmniSharp notifications (from PLAN.md)
  connection.onNotification('window/_roslyn_showToast', (params: any) => {
    console.log('🍞 Roslyn Toast:', params);
  });

  connection.onNotification(
    'workspace/projectInitializationComplete',
    (params: any) => {
      console.log('✅ Project initialization complete:', params);
    }
  );

  connection.onNotification('workspace/diagnostic/refresh', (params: any) => {
    console.log('🔄 Diagnostic refresh requested:', params);
  });

  // Start listening
  connection.listen();

  // Initialize the server with proper workspace and capabilities (matching C# version)
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
      workspace: {
        diagnostic: undefined, // null equivalent
      },
      textDocument: {
        publishDiagnostics: {
          relatedInformation: true,
          versionSupport: true,
          codeDescriptionSupport: true,
          dataSupport: true,
        },
        diagnostic: {
          dynamicRegistration: true,
          relatedDocumentSupport: true,
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
    console.log('✅ Server initialized:', initResult.capabilities);

    // Send initialized notification
    await connection.sendNotification('initialized', {});

    console.log('✅ Client and Server are ready!');

    // Example: Open a TypeScript file
    const testFilePath = path.join(workspaceFolder, 'playground', 'dotnet.ts');
    const testFileUri = `file://${testFilePath}`;

    console.log('\n📂 Opening document:', testFileUri);
    const didOpenParams: DidOpenTextDocumentParams = {
      textDocument: {
        uri: testFileUri,
        languageId: 'typescript',
        version: 1,
        text: 'console.log("Hello from opened document");',
      },
    };
    await connection.sendNotification('textDocument/didOpen', didOpenParams);

    // Example: Request document symbols
    console.log('\n🔍 Requesting document symbols...');
    const docSymbolParams: DocumentSymbolParams = {
      textDocument: {
        uri: testFileUri,
      } as TextDocumentIdentifier,
    };

    try {
      const symbols = await connection.sendRequest(
        'textDocument/documentSymbol',
        docSymbolParams
      );
      console.log('📋 Document symbols:', symbols);
    } catch (error) {
      console.log('❌ Document symbols request failed:', error);
    }

    // Wait a bit to see any server notifications
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Example: Close the document
    console.log('\n📄 Closing document:', testFileUri);
    const didCloseParams: DidCloseTextDocumentParams = {
      textDocument: {
        uri: testFileUri,
      } as TextDocumentIdentifier,
    };
    await connection.sendNotification('textDocument/didClose', didCloseParams);

    // Stop the server
    console.log('🛑 Stopping server...');

    await connection.sendRequest('shutdown', null);
    await connection.sendNotification('exit', null);

    serverProcess.kill();

    console.log('👋 Server stopped.');
  } catch (error) {
    console.error('❌ Error:', error);
    serverProcess.kill();
  }
}

runCli();

console.log('--- Done ---');
