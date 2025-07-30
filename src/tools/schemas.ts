/**
 * MCP Tool Schemas - shared schema definitions for all tools
 */

import { z } from 'zod';

export const symbolPositionSchema = {
  file: z.string(),
  line: z.number(),
  character: z.number(),
} as const;

export const fileSchema = {
  file: z.string(),
} as const;

export const searchSchema = {
  query: z.string(),
} as const;

export const renameSchema = {
  file: z.string(),
  line: z.number(),
  character: z.number(),
  newName: z.string(),
} as const;
