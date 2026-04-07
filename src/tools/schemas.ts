/**
 * MCP Tool Schemas - shared schema definitions for all tools
 */

import { z } from 'zod';

const fileDescription = 'File path (either absolute or relative to cwd)';
const lineDescription = '1-based line number where the cursor will be placed';
const charDescription =
  '1-based character number where the cursor will be placed';

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
      'Include code preview snippets from symbol declarations. Default false for compact output.'
    ),
} as const;

export const diagnosticsSchema = {
  file: z.string().describe(fileDescription),
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

export const logsSchema = {
  profile: z
    .string()
    .optional()
    .describe('Optional LSP profile name to restrict logs to a single session'),
} as const;

export const setupSchema = {
  action: z
    .enum(['reload'])
    .optional()
    .default('reload')
    .describe(
      'Reload the effective config and reapply it to currently running LSP sessions'
    ),
} as const;
