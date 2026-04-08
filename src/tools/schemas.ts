/**
 * MCP Tool Schemas - shared schema definitions for all tools
 */

import { z } from 'zod';

const fileDescription =
  'File path to inspect. Accepts either an absolute path or a path relative to the current workspace.';
const lineDescription =
  '1-based line number for the target symbol or cursor position.';
const charDescription =
  '1-based character number for the target symbol or cursor position.';

export const symbolPositionSchema = {
  file: z.string().describe(fileDescription),
  line: z.number().int().min(1).describe(lineDescription),
  character: z.number().int().min(1).describe(charDescription),
} as const;

// File-only schemas don't need transform versions since they don't have
// line/character fields to convert into OneBasedPosition
export const fileSchema = {
  file: z.string().describe(fileDescription),
  preview: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Include short declaration previews for symbols. Defaults to false for more compact output.'
    ),
} as const;

export const diagnosticsSchema = {
  file: z.string().describe(fileDescription),
} as const;

export const searchSchema = {
  query: z
    .string()
    .describe(
      'Workspace symbol query. Prefer a symbol name, prefix, or API term rather than full-text code.'
    ),
} as const;

export const renameSchema = {
  file: z.string().describe(fileDescription),
  line: z.number().int().min(1).describe(lineDescription),
  character: z.number().int().min(1).describe(charDescription),
  newName: z
    .string()
    .describe('Replacement name to use for the symbol at the given position.'),
} as const;
