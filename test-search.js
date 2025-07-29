#!/usr/bin/env node

/**
 * Quick test script to verify that preloaded files enable search functionality
 */

import { spawn } from 'child_process';

async function testMcpTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Send MCP request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    child.stdin.write(JSON.stringify(request) + '\n');
    child.stdin.end();

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ output, errorOutput });
      } else {
        reject(
          new Error(`Process exited with code ${code}. Error: ${errorOutput}`)
        );
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error('Test timed out'));
    }, 30000);
  });
}

async function main() {
  try {
    console.log('Testing search functionality with preloaded files...');

    // Test searching for a symbol that should exist
    const result = await testMcpTool('search', { query: 'LspContext' });

    console.log('Search test completed!');
    console.log('STDOUT:', result.output);
    if (result.errorOutput) {
      console.log('STDERR:', result.errorOutput);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

main();
