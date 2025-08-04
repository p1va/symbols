/**
 * Find Semantic Token at Position
 *
 * This implements and tests a function to find the semantic token at a specific
 * line/character position, similar to findSymbolAtPosition but for semantic tokens.
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

console.log('--- Find Semantic Token at Position ---');

// Test content with interesting positions to test
const testContent = `interface User {
  name: string;
  age: number;
}

class UserService {
  private users: User[] = [];
  
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

// Test cases for const x = func() pattern
const service = createService();
const result = service.getUsers();
const name = result[0]?.name;
const isReady = true;
`;

interface SemanticToken {
  line: number; // 0-based
  character: number; // 0-based
  length: number;
  tokenType: string;
  tokenModifiers: string[];
  text: string;
}

interface Position {
  line: number; // 0-based
  character: number; // 0-based
}

/**
 * Decodes semantic tokens from the LSP relative format into absolute positions
 */
function decodeSemanticTokens(
  data: number[],
  tokenTypes: string[],
  tokenModifiers: string[],
  fileContent: string
): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  const lines = fileContent.split('\n');

  let currentLine = 0;
  let currentChar = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    const length = data[i + 2];
    const tokenType = data[i + 3];
    const tokenModifiersBits = data[i + 4];

    // Calculate absolute position
    currentLine += deltaLine;
    currentChar = deltaLine === 0 ? currentChar + deltaStart : deltaStart;

    // Extract token text
    const tokenText =
      lines[currentLine]?.substring(currentChar, currentChar + length) || '';

    // Decode modifiers
    const modifiersList: string[] = [];
    for (let bit = 0; bit < tokenModifiers.length; bit++) {
      if (tokenModifiersBits & (1 << bit)) {
        modifiersList.push(tokenModifiers[bit]);
      }
    }

    tokens.push({
      line: currentLine,
      character: currentChar,
      length,
      tokenType: tokenTypes[tokenType] || 'unknown',
      tokenModifiers: modifiersList,
      text: tokenText,
    });
  }

  return tokens;
}

/**
 * Finds the semantic token at the given position (line, character)
 * Returns null if no token found at that position
 */
function findSemanticTokenAtPosition(
  tokens: SemanticToken[],
  position: Position
): SemanticToken | null {
  for (const token of tokens) {
    if (token.line === position.line) {
      // Check if position falls within token's character range
      if (
        position.character >= token.character &&
        position.character < token.character + token.length
      ) {
        return token;
      }
    }
  }
  return null;
}

/**
 * Test positions to check - these correspond to interesting parts of our test content
 */
const testPositions = [
  // Line 23: const service = createService();
  {
    line: 22,
    character: 6,
    description: "const 'service' variable declaration",
  },
  { line: 22, character: 17, description: "function 'createService' call" },

  // Line 24: const result = service.getUsers();
  {
    line: 23,
    character: 6,
    description: "const 'result' variable declaration",
  },
  { line: 23, character: 16, description: "variable 'service' usage" },
  { line: 23, character: 24, description: "method 'getUsers' call" },

  // Line 25: const name = result[0]?.name;
  { line: 24, character: 6, description: "const 'name' variable declaration" },
  { line: 24, character: 14, description: "variable 'result' usage" },
  { line: 24, character: 25, description: "property 'name' access" },

  // Line 26: const isReady = true;
  {
    line: 25,
    character: 6,
    description: "const 'isReady' variable declaration",
  },

  // Test some other constructs
  { line: 0, character: 11, description: "interface 'User' declaration" },
  { line: 5, character: 7, description: "class 'UserService' declaration" },
  {
    line: 17,
    character: 10,
    description: "function 'createService' declaration",
  },
];

async function testFindSemanticToken() {
  console.log(
    '🚀 Starting Language Server for semantic token position test...'
  );

  const serverProcess = cp.spawn('typescript-language-server', ['--stdio']);
  const connection = rpc.createMessageConnection(
    serverProcess.stdout,
    serverProcess.stdin
  );

  connection.onNotification((method: string, params: any) => {
    // Suppress most notifications for cleaner output
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

    const serverTokenTypes =
      initResult.capabilities?.semanticTokensProvider?.legend?.tokenTypes || [];
    const serverTokenModifiers =
      initResult.capabilities?.semanticTokensProvider?.legend?.tokenModifiers ||
      [];

    await connection.sendNotification('initialized', {});

    const testFileUri = `file://${workspaceFolder}/test-find-semantic.ts`;

    console.log('\n📂 Opening test document...');

    const didOpenParams: DidOpenTextDocumentParams = {
      textDocument: {
        uri: testFileUri,
        languageId: 'typescript',
        version: 1,
        text: testContent,
      },
    };
    await connection.sendNotification('textDocument/didOpen', didOpenParams);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get semantic tokens
    console.log('🎨 Getting semantic tokens...');
    const semanticTokensParams: SemanticTokensParams = {
      textDocument: {
        uri: testFileUri,
      } as TextDocumentIdentifier,
    };

    const semanticTokens = await connection.sendRequest(
      'textDocument/semanticTokens/full',
      semanticTokensParams
    );

    const data = (semanticTokens as any)?.data;

    if (!data || data.length === 0) {
      console.log('❌ No semantic tokens received');
      return;
    }

    // Decode all tokens
    const decodedTokens = decodeSemanticTokens(
      data,
      serverTokenTypes,
      serverTokenModifiers,
      testContent
    );

    console.log(`✅ Decoded ${decodedTokens.length} semantic tokens\n`);

    // Test our findSemanticTokenAtPosition function
    console.log('🎯 Testing findSemanticTokenAtPosition function:');
    console.log('='.repeat(80));

    for (const testPos of testPositions) {
      console.log(
        `\n📍 Testing position (${testPos.line + 1}, ${testPos.character + 1}): ${testPos.description}`
      );

      // Show the line content for context
      const lines = testContent.split('\n');
      const lineContent = lines[testPos.line] || '';
      console.log(`   Line content: "${lineContent}"`);
      console.log(`   Position marker: ${' '.repeat(testPos.character)}^`);

      const foundToken = findSemanticTokenAtPosition(decodedTokens, testPos);

      if (foundToken) {
        console.log(`   ✅ Found token: "${foundToken.text}"`);
        console.log(`      Type: ${foundToken.tokenType}`);
        console.log(
          `      Modifiers: [${foundToken.tokenModifiers.join(', ')}]`
        );
        console.log(
          `      Range: (${foundToken.line + 1}, ${foundToken.character + 1}) length ${foundToken.length}`
        );
      } else {
        console.log(`   ❌ No token found at this position`);
      }
    }

    // Special test: Show all tokens on the "const service = createService();" line
    console.log('\n🔍 All tokens on line "const service = createService();":');
    console.log('='.repeat(60));

    const constServiceLine = 22; // 0-based
    const tokensOnLine = decodedTokens.filter(
      (token) => token.line === constServiceLine
    );

    for (const token of tokensOnLine) {
      console.log(
        `Token "${token.text}" at char ${token.character + 1}-${token.character + token.length}`
      );
      console.log(
        `  Type: ${token.tokenType}, Modifiers: [${token.tokenModifiers.join(', ')}]`
      );
    }

    // Cleanup
    const didCloseParams: DidCloseTextDocumentParams = {
      textDocument: { uri: testFileUri } as TextDocumentIdentifier,
    };
    await connection.sendNotification('textDocument/didClose', didCloseParams);

    await connection.sendRequest('shutdown', null);
    await connection.sendNotification('exit', null);
    serverProcess.kill();

    console.log('\n👋 Find semantic token test completed.');
  } catch (error) {
    console.error('❌ Error:', error);
    serverProcess.kill();
  }
}

testFindSemanticToken();
