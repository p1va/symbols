import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

export interface PreloadFileMatch {
  entry: string;
  resolvedPath: string;
  matchCount: number;
}

export interface PreloadFileResolution {
  resolvedEntries: PreloadFileMatch[];
  missingEntries: string[];
}

const PRELOAD_GLOB_MAGIC = /[*?[\]{}]/;

const DEFAULT_TYPESCRIPT_PRELOAD_ENTRIES = [
  './src/{index,main,app}.ts',
  './{index,main}.ts',
];

export function isTypeScriptServerCommand(
  commandName: string,
  commandArgs: string[]
): boolean {
  if (commandName === 'typescript-language-server') {
    return true;
  }

  return commandArgs.some((arg) => arg.includes('typescript-language-server'));
}

export function getDefaultPreloadEntriesForProfile(profile: {
  name?: string;
  commandName: string;
  commandArgs: string[];
}): string[] {
  if (
    profile.name === 'typescript' ||
    isTypeScriptServerCommand(profile.commandName, profile.commandArgs)
  ) {
    return [...DEFAULT_TYPESCRIPT_PRELOAD_ENTRIES];
  }

  return [];
}

function hasPatternMagic(entry: string): boolean {
  return PRELOAD_GLOB_MAGIC.test(entry);
}

function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export async function resolvePreloadEntries(
  workspacePath: string,
  entries: string[]
): Promise<PreloadFileResolution> {
  const resolvedEntries: PreloadFileMatch[] = [];
  const missingEntries: string[] = [];
  const seenPaths = new Set<string>();

  for (const entry of entries) {
    if (hasPatternMagic(entry)) {
      const matches = (
        await glob(entry, {
          absolute: true,
          cwd: workspacePath,
          nodir: true,
        })
      ).sort((left, right) => left.localeCompare(right));

      const matchedFile = matches.find((match) => isExistingFile(match));
      if (!matchedFile) {
        missingEntries.push(entry);
        continue;
      }

      const resolvedPath = path.normalize(matchedFile);
      if (seenPaths.has(resolvedPath)) {
        continue;
      }

      seenPaths.add(resolvedPath);
      resolvedEntries.push({
        entry,
        resolvedPath,
        matchCount: matches.length,
      });
      continue;
    }

    const resolvedPath = path.normalize(
      path.isAbsolute(entry)
        ? path.resolve(entry)
        : path.resolve(workspacePath, entry)
    );

    if (!isExistingFile(resolvedPath)) {
      missingEntries.push(entry);
      continue;
    }

    if (seenPaths.has(resolvedPath)) {
      continue;
    }

    seenPaths.add(resolvedPath);
    resolvedEntries.push({
      entry,
      resolvedPath,
      matchCount: 1,
    });
  }

  return {
    resolvedEntries,
    missingEntries,
  };
}
