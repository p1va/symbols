/**
 * Shared utilities for tool formatting
 */

import * as fs from 'fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChangeResult } from './workspace-edits.js';
import { formatZeroBasedPosition } from '../types/position.js';

const SYMBOL_KIND_NAMES: Readonly<Record<number, string>> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};

export function getSymbolKindName(kind: number): string {
  return SYMBOL_KIND_NAMES[kind] ?? 'Unknown';
}

export function fileUriToPath(uriOrPath: string): string {
  return uriOrPath.startsWith('file:') ? fileURLToPath(uriOrPath) : uriOrPath;
}

export function formatFilePath(
  fileUriOrPath: string,
  relativeRoot = process.cwd()
): string {
  let cleanPath: string;

  try {
    cleanPath = fileUriToPath(fileUriOrPath);
  } catch {
    cleanPath = fileUriOrPath;
  }

  if (path.isAbsolute(cleanPath)) {
    const relativePath = path.relative(path.resolve(relativeRoot), cleanPath);
    const isWithinRoot =
      relativePath === '' ||
      (relativePath !== '..' &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath));

    if (isWithinRoot) {
      return relativePath;
    }
  }

  return cleanPath;
}

async function readFileLines(fileUri: string): Promise<string[] | null> {
  try {
    const filePath = fileUriToPath(fileUri);
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    return fileContent.split('\n');
  } catch {
    return null;
  }
}

/**
 * Formats rename operation results with symbols like diagnostics
 */
export async function formatRenameResults(
  results: ChangeResult[],
  symbolName: string,
  newName: string,
  workspacePath?: string
): Promise<string> {
  const totalChanges = results.reduce(
    (sum, r) => sum + r.appliedChanges.length,
    0
  );
  const totalFailed = results.reduce(
    (sum, r) => sum + r.failedChanges.length,
    0
  );
  const fileCount = results.length;

  let output = `Rename '${symbolName}' → '${newName}': ${totalChanges} changes across ${fileCount} file(s)`;

  if (totalFailed > 0) {
    output += ` (${totalFailed} failed)`;
  }

  // Group results by file
  for (const result of results) {
    const filePath = formatFilePath(result.fileUri, workspacePath);
    const changeCount =
      result.appliedChanges.length + result.failedChanges.length;

    output += `\n\n${filePath} (${changeCount} changes)`;

    if (result.error) {
      output += `\n  ✘ File error: ${result.error}`;
      continue;
    }

    const fileLines =
      result.appliedChanges.length > 0
        ? await readFileLines(result.fileUri)
        : null;

    // Show successful changes with code context
    for (const change of result.appliedChanges) {
      output += `\n  ✓ @${formatZeroBasedPosition(change.range.start)} ${symbolName} → ${newName}`;

      if (fileLines) {
        const contextLine = fileLines[change.range.start.line];

        if (contextLine) {
          const trimmedLine = contextLine.trim();
          if (trimmedLine) {
            output += `\n    \`${trimmedLine}\``;
          }
        }
      } else {
        const changeText = change.oldText.replace(/\n/g, '\\n');
        if (changeText !== change.newText) {
          output += `\n    \`${changeText}\` → \`${change.newText}\``;
        }
      }
    }

    // Show failed changes
    for (const failed of result.failedChanges) {
      output += `\n  ✘ @${formatZeroBasedPosition(failed.range.start)} ${symbolName} → ${newName} (${failed.error})`;
    }
  }

  return output.trim();
}
