/**
 * MCP Tool Schemas - shared schema definitions for all tools
 */

import { z } from 'zod';
import { createOneBasedPosition } from '../types/position.js';
import type { OneBasedPosition } from '../types/position.js';

// Note: OneBasedPosition transforms are defined inline in the schemas below
// to avoid unused variable warnings while keeping the patterns clear

const fileDescription = 'File path (either absolute or relative to cwd)';
const lineDescription = '1-based line number where the cursor will be placed';
const charDescription =
  '1-based character number where the cursor will be placed';

export const symbolPositionSchema = {
  file: z.string().describe(fileDescription),
  line: z.number().int().min(1).describe(lineDescription),
  character: z.number().int().min(1).describe(charDescription),
} as const;

// Schema that transforms to OneBasedPosition
export const symbolPositionWithTransformSchema = z
  .object({
    file: z.string().describe(fileDescription),
    line: z.number().int().min(1).describe(lineDescription),
    character: z.number().int().min(1).describe(charDescription),
  })
  .transform(({ file, line, character }) => ({
    file,
    position: createOneBasedPosition(line, character),
  }));

export const fileSchema = {
  file: z.string().describe(fileDescription),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(99)
    .describe(
      'Filters output symbols based on their depth in the syntax tree. e.g. 0 = only top-level symbols, 1 = top-level and first-level children, etc.'
    ),
  previewMode: z
    .enum(['none', 'signature', 'expanded'])
    .optional()
    .default('none')
    .describe(
      'Preview mode for symbols: none = names only, signature = first few lines (good for intent), expanded = longer per-symbol snippets.'
    ),
} as const;

export const searchSchema = {
  query: z.string().describe('Search query to find symbols by name or pattern'),
} as const;

export const renameSchema = {
  file: z.string().describe(fileDescription),
  line: z.number().int().min(1).describe(lineDescription),
  character: z.number().int().min(1).describe(charDescription),
  newName: z.string().describe('New name for the symbol'),
} as const;

// Schema that transforms to OneBasedPosition for rename
export const renameWithTransformSchema = z
  .object({
    file: z.string().describe(fileDescription),
    line: z.number().int().min(1).describe(lineDescription),
    character: z.number().int().min(1).describe(charDescription),
    newName: z.string().describe('New name for the symbol'),
  })
  .transform(({ file, line, character, newName }) => ({
    file,
    position: createOneBasedPosition(line, character),
    newName,
  }));

// Type definitions for the transformed schemas
export type SymbolPositionWithPosition = {
  file: string;
  position: OneBasedPosition;
};

export type RenameWithPosition = {
  file: string;
  position: OneBasedPosition;
  newName: string;
};
