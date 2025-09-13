import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const requireResolve = createRequire(path.join(process.cwd(), 'package.json'));

interface PackageJson {
  bin?: string | Record<string, string>;
}

export function resolveBinPath(pkg: string, executable?: string): string {
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
        `Package ${pkg} is not installed or not found in node_modules`
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
