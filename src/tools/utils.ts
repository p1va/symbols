/**
 * Shared utilities for tool formatting
 */

import * as fs from 'fs';
import { FileChange } from '../types/lsp.js';

export function getSymbolKindName(kind: number): string {
  const symbolKinds: { [key: number]: string } = {
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

  return symbolKinds[kind] || 'Unknown';
}

export function formatFilePath(path: string): string {
  // Remove file:// prefix if present
  let cleanPath = path.replace('file://', '');

  // Decode URL encoding (like %40 -> @)
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {
    // If decoding fails, use the original path
  }

  // Make path relative to current working directory if it starts with it
  const cwd = process.cwd();
  if (cleanPath.startsWith(cwd)) {
    let relativePath = cleanPath.substring(cwd.length);
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
    return relativePath;
  }

  return cleanPath;
}

// Rename operation result types
export interface ChangeResult {
  fileUri: string;
  success: boolean;
  appliedChanges: AppliedChange[];
  failedChanges: FailedChange[];
  error?: string;
}

export interface AppliedChange {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  oldText: string;
  newText: string;
  line: number; // 1-based for display
  character: number; // 1-based for display
}

export interface FailedChange {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  newText: string;
  line: number; // 1-based for display  
  character: number; // 1-based for display
  error: string;
}

/**
 * Applies changes to a single file safely by reading from disk and applying bottom-up
 */
export async function applyFileChanges(
  fileUri: string,
  changes: FileChange[]
): Promise<ChangeResult> {
  const filePath = formatFilePath(fileUri);
  const result: ChangeResult = {
    fileUri,
    success: false,
    appliedChanges: [],
    failedChanges: [],
  };

  try {
    // Read current file content from disk
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const lines = fileContent.split('\n');

    // Sort changes by end position (descending) to apply bottom-up and avoid position shifting
    const sortedChanges = [...changes].sort((a, b) => {
      if (a.range.end.line !== b.range.end.line) {
        return b.range.end.line - a.range.end.line; // Higher line first
      }
      return b.range.end.character - a.range.end.character; // Higher character first
    });

    // Apply changes one by one
    for (const change of sortedChanges) {
      try {
        const startLine = change.range.start.line; // 0-based from LSP
        const startChar = change.range.start.character; // 0-based from LSP  
        const endLine = change.range.end.line; // 0-based from LSP
        const endChar = change.range.end.character; // 0-based from LSP

        // Validate bounds
        if (startLine < 0 || startLine >= lines.length || endLine < 0 || endLine >= lines.length) {
          result.failedChanges.push({
            range: change.range,
            newText: change.newText,
            line: startLine + 1, // Convert to 1-based
            character: startChar + 1, // Convert to 1-based
            error: 'Position out of bounds'
          });
          continue;
        }

        // Extract old text for comparison
        let oldText: string;
        if (startLine === endLine) {
          // Single line change
          const line = lines[startLine]!; // Safe after bounds check
          if (startChar > line.length || endChar > line.length) {
            result.failedChanges.push({
              range: change.range,
              newText: change.newText,
              line: startLine + 1,
              character: startChar + 1,
              error: 'Character position out of bounds'
            });
            continue;
          }
          oldText = line.substring(startChar, endChar);
          
          // Apply the change
          lines[startLine] = line.substring(0, startChar) + change.newText + line.substring(endChar);
        } else {
          // Multi-line change
          const firstLine = lines[startLine]!; // Safe after bounds check
          const lastLine = lines[endLine]!; // Safe after bounds check
          
          if (startChar > firstLine.length || endChar > lastLine.length) {
            result.failedChanges.push({
              range: change.range,
              newText: change.newText,
              line: startLine + 1,
              character: startChar + 1,
              error: 'Character position out of bounds'
            });
            continue;
          }

          // Extract old text across multiple lines
          const oldParts: string[] = [];
          oldParts.push(firstLine.substring(startChar)); // Rest of first line
          for (let i = startLine + 1; i < endLine; i++) {
            const middleLine = lines[i];
            if (middleLine !== undefined) {
              oldParts.push(middleLine); // Entire middle lines
            }
          }
          oldParts.push(lastLine.substring(0, endChar)); // Start of last line
          oldText = oldParts.join('\n');

          // Apply the change by replacing multiple lines with potentially different content
          const newContent = firstLine.substring(0, startChar) + change.newText + lastLine.substring(endChar);
          const newLines = newContent.split('\n');
          
          // Replace the affected lines
          lines.splice(startLine, endLine - startLine + 1, ...newLines);
        }

        // Record successful change
        result.appliedChanges.push({
          range: change.range,
          oldText,
          newText: change.newText,
          line: startLine + 1, // Convert to 1-based for display
          character: startChar + 1 // Convert to 1-based for display  
        });

      } catch (error) {
        result.failedChanges.push({
          range: change.range,
          newText: change.newText,
          line: change.range.start.line + 1,
          character: change.range.start.character + 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Write the modified content back to disk if any changes were applied
    if (result.appliedChanges.length > 0) {
      await fs.promises.writeFile(filePath, lines.join('\n'), 'utf-8');
      result.success = true;
    } else if (result.failedChanges.length === 0) {
      // No changes to apply - this is also success
      result.success = true;
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error reading/writing file';
  }

  return result;
}

/**
 * Applies workspace changes across multiple files with best-effort approach
 */  
export async function applyWorkspaceChanges(
  renameResult: Record<string, FileChange[]>
): Promise<ChangeResult[]> {
  const results: ChangeResult[] = [];
  
  // Process each file independently (best-effort approach)
  for (const [fileUri, changes] of Object.entries(renameResult)) {
    const result = await applyFileChanges(fileUri, changes);
    results.push(result);
  }

  return results;
}

/**
 * Formats rename operation results for Claude Code with symbols like diagnostics
 */
export async function formatRenameResults(
  results: ChangeResult[],
  symbolName: string,
  newName: string
): Promise<string> {
  const totalChanges = results.reduce((sum, r) => sum + r.appliedChanges.length, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failedChanges.length, 0);
  const fileCount = results.length;

  let output = `Rename '${symbolName}' → '${newName}': ${totalChanges} changes across ${fileCount} file(s)`;
  
  if (totalFailed > 0) {
    output += ` (${totalFailed} failed)`;
  }

  // Group results by file
  for (const result of results) {
    const filePath = formatFilePath(result.fileUri);
    const changeCount = result.appliedChanges.length + result.failedChanges.length;
    
    output += `\n\n${filePath} (${changeCount} changes)`;
    
    if (result.error) {
      output += `\n  ✘ File error: ${result.error}`;
      continue;
    }

    // Show successful changes with code context
    for (const change of result.appliedChanges) {
      output += `\n  ✓ @${change.line}:${change.character} ${symbolName} → ${newName}`;
      
      // Read the actual line from the file to show context (after change was applied)
      try {
        const filePath = formatFilePath(result.fileUri);
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');
        const lines = fileContent.split('\n');
        const contextLine = lines[change.line - 1]; // Convert back to 0-based
        
        if (contextLine) {
          // Trim and show the line with the new name
          const trimmedLine = contextLine.trim();
          if (trimmedLine) {
            output += `\n    \`${trimmedLine}\``;
          }
        }
      } catch {
        // Fallback to showing just the change if we can't read the file
        const changeText = change.oldText.replace(/\n/g, '\\n');
        if (changeText !== change.newText) {
          output += `\n    \`${changeText}\` → \`${change.newText}\``;
        }
      }
    }

    // Show failed changes  
    for (const failed of result.failedChanges) {
      output += `\n  ✘ @${failed.line}:${failed.character} ${symbolName} → ${newName} (${failed.error})`;
    }
  }

  return output.trim();
}
