/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import _ from 'lodash';

/**
 * Main entry point for the TypeScript test project
 * This file contains intentional issues for testing diagnostics
 */
export function main(): void {
  console.log('Hello from TypeScript test project!');

  // Test TypeScript diagnostics with intentional errors
  const undefinedVariable = (globalThis as any).someUndefinedVariable; // Type error
  const unusedVariable = 42; // Unused variable warning

  // Test some lodash usage for completion/references testing
  const numbers = [1, 2, 3, 4, 5];
  const doubled = (_ as any).map(numbers, (n: number) => n * 2);

  console.log('Doubled:', doubled);
  console.log('Value:', undefinedVariable);
}

/**
 * Helper interface for testing symbol inspection
 */
export interface TestConfig {
  name: string;
  value: number;
  options?: {
    enabled: boolean;
    timeout: number;
  };
}

/**
 * Helper class for testing symbol inspection
 */
export class TestService {
  private config: TestConfig;

  constructor(config: TestConfig) {
    this.config = config;
  }

  /**
   * Process the configuration
   */
  processConfig(): string {
    return `Processing ${this.config.name} with value ${this.config.value}`;
  }

  /**
   * Get configuration value
   */
  getValue(): number {
    return this.config.value;
  }
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  main();
}
