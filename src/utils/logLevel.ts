import * as fs from 'fs';

/**
 * Convert log level numbers to readable names
 */
export function getLogLevelName(type: number): string {
  switch (type) {
    case 1:
      return 'Error';
    case 2:
      return 'Warning';
    case 3:
      return 'Info';
    case 4:
      return 'Log';
    default:
      return 'Unknown';
  }
}

/**
 * Get default preloaded files based on common TypeScript patterns
 */
export function getDefaultPreloadFiles(): string[] {
  const candidates = [
    './src/index.ts',
    './src/main.ts',
    './src/app.ts',
    './index.ts',
    './main.ts',
  ];

  // Return the first file that exists
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return [candidate];
      }
    } catch {
      // Ignore errors and continue
    }
  }

  return [];
}
