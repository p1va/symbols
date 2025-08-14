/**
 * MCP Tool Schemas - shared schema definitions for all tools
 */

import { z } from 'zod';
import { createOneBasedPosition } from '../types/position.js';
import type { OneBasedPosition } from '../types/position.js';

// TODO: Apply descrition everywhere

// Note: OneBasedPosition transforms are defined inline in the schemas below
// to avoid unused variable warnings while keeping the patterns clear

export const symbolPositionSchema = {
  file: z.string(),
  line: z.number().int().min(1),
  character: z.number().int().min(1),
} as const;

// Schema that transforms to OneBasedPosition
export const symbolPositionWithTransformSchema = z
  .object({
    file: z
      .string()
      .describe(
        'File path (either absolute or relative to the working directory)'
      ),
    line: z
      .number()
      .int()
      .min(1)
      .describe(
        'Line number (1-based) at which the symbol of interest is located'
      ),
    character: z
      .number()
      .int()
      .min(1)
      .describe(
        'Character number (1-based) at which the symbol of interest is located'
      ),
  })
  .transform(({ file, line, character }) => ({
    file,
    position: createOneBasedPosition(line, character),
  }));

export const fileSchema = {
  file: z
    .string()
    .describe(
      'File path (either absolute or relative to the working directory)'
    ),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(99)
    .describe(
      'Filters output symbols based on their depth in the syntax tree. e.g. 0 = only top-level symbols, 1 = top-level and first-level children, etc.'
    ),
  previewMode: z.enum(['none', 'signature', 'full']).optional().default('none'),
} as const;

export const searchSchema = {
  query: z.string(),
} as const;

export const renameSchema = {
  file: z.string(),
  line: z.number().int().min(1),
  character: z.number().int().min(1),
  newName: z.string(),
} as const;

// Schema that transforms to OneBasedPosition for rename
export const renameWithTransformSchema = z
  .object({
    file: z.string(),
    line: z.number().int().min(1),
    character: z.number().int().min(1),
    newName: z.string(),
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
