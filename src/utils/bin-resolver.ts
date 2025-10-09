import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

interface PackageJson {
  bin?: string | Record<string, string>;
}

// Get the directory where this module is located (dist/utils/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the CLI's root directory (where package.json is)
// From dist/utils/bin-resolver.js -> go up to dist/ -> go up to root/
const CLI_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Resolve the path to an executable from a package in the CLI's node_modules
 * This allows the CLI to bundle language servers as dependencies
 * @param pkg - Package name
 * @param executable - Optional executable name (defaults to package name)
 */
export function resolveBinPath(pkg: string, executable?: string): string {
  // Create a require function that resolves from the CLI's installation directory
  const requireResolve = createRequire(path.join(CLI_ROOT, 'package.json'));

  try {
    const modulePath = requireResolve.resolve(`${pkg}/package.json`);
    const packageDir = path.dirname(modulePath);

    const packageJsonContent = fs.readFileSync(modulePath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent) as PackageJson;

    if (!packageJson.bin) {
      throw new Error(
        `Package ${pkg} does not define any executables in package.json`
      );
    }

    let binPath: string;

    if (typeof packageJson.bin === 'string') {
      if (executable && executable !== pkg) {
        throw new Error(
          `Package ${pkg} only defines one executable (${pkg}), but ${executable} was requested`
        );
      }
      binPath = packageJson.bin;
    } else {
      const executableName = executable || pkg;
      if (!packageJson.bin[executableName]) {
        const availableExecutables = Object.keys(packageJson.bin).join(', ');
        throw new Error(
          `Executable ${executableName} not found in package ${pkg}. Available: ${availableExecutables}`
        );
      }
      binPath = packageJson.bin[executableName];
    }

    const absoluteBinPath = path.resolve(packageDir, binPath);

    if (!fs.existsSync(absoluteBinPath)) {
      throw new Error(
        `Executable not found at resolved path: ${absoluteBinPath}`
      );
    }

    return absoluteBinPath;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Cannot find module')
    ) {
      throw new Error(
        `Package ${pkg} is not installed in the CLI's dependencies. Searched in: ${CLI_ROOT}\n` +
          `Hint: The symbols CLI should include ${pkg} as a dependency. If you installed symbols, try:\n` +
          `  - Reinstalling: npm install -g @p1va/symbols (or your package manager)\n` +
          `  - Or installing the language server separately in your workspace`
      );
    }
    throw error;
  }
}

export function isNodeScript(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return true;
  }

  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(128);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    const firstLine = buffer.subarray(0, bytesRead).toString('utf8');
    return /#!.*\bnode\b/.test(firstLine);
  } catch {
    return false;
  }
}

/**
 * Resolve a package executable into a command and args
 * Resolves from the CLI's own node_modules
 * @param pkg - Package name
 * @param executable - Optional executable name (defaults to package name)
 */
export function resolveBinCommand(
  pkg: string,
  executable?: string
): {
  commandName: string;
  commandArgs: string[];
} {
  const binPath = resolveBinPath(pkg, executable);

  if (isNodeScript(binPath)) {
    return {
      commandName: 'node',
      commandArgs: [binPath],
    };
  } else {
    return {
      commandName: binPath,
      commandArgs: [],
    };
  }
}
