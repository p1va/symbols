/**
 * Symbol enrichment utilities - adds code snippets to symbols
 */

import * as fs from 'fs/promises';
import type { Range } from '../types/lsp.js';
import { fileUriToPath } from './utils.js';

export type EnrichmentRequest =
  | {
      uri: string | null;
      extent: 'range';
      range: Range;
    }
  | {
      uri: string | null;
      extent: 'line';
      line: number;
    }
  | {
      uri: string | null;
      extent: 'declaration';
      range: Range;
    };

interface EnrichmentResult {
  request: EnrichmentRequest;
  codeSnippet: string | null;
  error: string | null;
}

/**
 * Returns exactly one result per request, in input order. File reads are
 * cached as promises so interleaved requests for the same file share one read.
 */
export async function enrichCodeSnippets(
  requests: readonly EnrichmentRequest[]
): Promise<EnrichmentResult[]> {
  const fileCache = new Map<string, Promise<string[]>>();

  const readLines = (filePath: string): Promise<string[]> => {
    const cached = fileCache.get(filePath);
    if (cached) {
      return cached;
    }

    const pending = fs
      .readFile(filePath, 'utf-8')
      .then((fileContent) => fileContent.split('\n'));
    fileCache.set(filePath, pending);
    return pending;
  };

  return await Promise.all(
    requests.map(async (request): Promise<EnrichmentResult> => {
      if (!request.uri) {
        return failedResult(request, 'Could not enrich code without a URI');
      }

      let filePath: string;
      try {
        filePath = fileUriToPath(request.uri);
      } catch (error) {
        return failedResult(
          request,
          `Could not resolve file URI: ${errorMessage(error)}`
        );
      }

      try {
        const lines = await readLines(filePath);
        return {
          request,
          codeSnippet: extractRequestedSnippet(lines, request),
          error: null,
        };
      } catch (error) {
        return failedResult(
          request,
          `Could not read file: ${errorMessage(error)}`
        );
      }
    })
  );
}

function failedResult(
  request: EnrichmentRequest,
  error: string
): EnrichmentResult {
  return { request, codeSnippet: null, error };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function extractRequestedSnippet(
  fileLines: string[],
  request: EnrichmentRequest
): string {
  switch (request.extent) {
    case 'range':
      return extractRangeSnippet(fileLines, request.range);
    case 'line':
      return extractLineSnippet(fileLines, request.line);
    case 'declaration':
      return extractDeclarationSnippet(fileLines, request.range);
  }
}

function extractLineSnippet(fileLines: string[], line: number): string {
  return fileLines[line] ?? '// Code snippet unavailable - invalid line';
}

function extractDeclarationSnippet(fileLines: string[], range: Range): string {
  const startLine = range.start.line;
  if (
    startLine < 0 ||
    startLine >= fileLines.length ||
    range.end.line < startLine
  ) {
    return '// Code snippet unavailable - invalid range';
  }

  const endLine = Math.min(startLine + 3, range.end.line, fileLines.length - 1);
  return fileLines.slice(startLine, endLine + 1).join('\n');
}

function extractRangeSnippet(fileLines: string[], range: Range): string {
  const startLine = range.start.line;
  const endLine = range.end.line;
  const startChar = range.start.character;
  const endChar = range.end.character;

  if (
    startLine < 0 ||
    startLine >= fileLines.length ||
    endLine < 0 ||
    endLine >= fileLines.length
  ) {
    return '// Code snippet unavailable - invalid range';
  }

  if (startLine === endLine) {
    const line = fileLines[startLine];
    if (line === undefined) {
      return '// Code snippet unavailable - line not found';
    }
    return line.substring(startChar, endChar);
  }

  const snippetLines: string[] = [];

  const firstLine = fileLines[startLine];
  if (firstLine !== undefined) {
    snippetLines.push(firstLine.substring(startChar));
  }

  for (let i = startLine + 1; i < endLine; i++) {
    const line = fileLines[i];
    if (line !== undefined) {
      snippetLines.push(line);
    }
  }

  const lastLine = fileLines[endLine];
  if (lastLine !== undefined) {
    snippetLines.push(lastLine.substring(0, endChar));
  }

  return snippetLines.join('\n');
}

/**
 * Creates a single-line signature preview from a code snippet
 * Condenses whitespace and limits to specified character count
 */
export function createSignaturePreview(
  codeSnippet: string,
  maxChars: number = 100
): string {
  // Normalize whitespace: replace newlines with spaces, collapse multiple spaces
  const normalized = codeSnippet
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Collapse multiple whitespace to single space
    .trim(); // Remove leading/trailing whitespace

  // Truncate if too long
  if (normalized.length <= maxChars) {
    return normalized;
  }

  // Find a good truncation point (prefer to break at word boundaries)
  const truncated = normalized.substring(0, maxChars - 3);
  const lastSpace = truncated.lastIndexOf(' ');

  // If we found a space near the end, break there; otherwise just cut at maxChars
  const breakPoint = lastSpace > maxChars - 20 ? lastSpace : maxChars - 3;
  return normalized.substring(0, breakPoint) + '...';
}
