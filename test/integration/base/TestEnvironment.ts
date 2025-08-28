/**
 * Environment detection and command configuration for integration tests
 */
export interface TestCommand {
  command: string;
  args: string[];
}

/**
 * Determines the appropriate command and arguments for running the MCP server
 * based on the current environment (CI vs local development)
 */
export async function getTestCommand(): Promise<TestCommand> {
  // Check for CI environment. Many CI systems set CI=true automatically.
  const isCI = process.env.CI === 'true';
  
  if (isCI) {
    // In CI, test the built artifact to ensure production deployment will work
    const fs = await import('fs');
    const path = await import('path');
    const distPath = path.join(process.cwd(), 'dist', 'index.js');
    
    if (!fs.existsSync(distPath)) {
      throw new Error(`CI mode requires built artifact at ${distPath}. Please run 'pnpm build' first.`);
    }
    
    return {
      command: 'node',
      args: ['dist/index.js']
    };
  } else {
    // Local development: use tsx for faster iteration (no build required)
    return {
      command: 'pnpm',
      args: ['exec', 'tsx', 'src/index.ts']
    };
  }
}

/**
 * Get a human-readable description of the current test environment
 */
export async function getTestEnvironmentInfo(): Promise<string> {
  const isCI = process.env.CI === 'true';
  const nodeEnv = process.env.NODE_ENV || 'undefined';
  const command = await getTestCommand();
  
  return `Environment: ${isCI ? 'CI' : 'Local'} | NODE_ENV: ${nodeEnv} | Command: ${command.command} ${command.args.join(' ')}`;
}

/**
 * Environment-aware timeout values for different scenarios
 */
export function getTestTimeouts() {
  const isCI = process.env.CI === 'true';
  
  return {
    // Connection timeout - CI might be slower due to fresh language server installs
    connection: isCI ? 30000 : 20000, // 30s in CI, 20s locally
    
    // Test timeout - Built version might start faster, but LSP startup is the bottleneck
    test: isCI ? 45000 : 30000, // 45s in CI, 30s locally
    
    // Setup timeout for beforeAll
    setup: isCI ? 60000 : 40000, // 60s in CI, 40s locally
  };
}