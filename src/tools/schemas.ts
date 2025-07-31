/**
 * MCP Tool Schemas - shared schema definitions for all tools
 */

import { z } from 'zod';
import { createOneBasedPosition, OneBasedPosition } from '../types/position.js';

// Custom zod transform for OneBasedPosition
const oneBasedPositionTransform = z
  .object({
    line: z.number().int().min(1),
    character: z.number().int().min(1),
  })
  .transform(({ line, character }) => createOneBasedPosition(line, character));

export const symbolPositionSchema = {
  file: z.string(),
  line: z.number().int().min(1),
  character: z.number().int().min(1),
} as const;

// Schema that transforms to OneBasedPosition
export const symbolPositionWithTransformSchema = z
  .object({
    file: z.string(),
    line: z.number().int().min(1),
    character: z.number().int().min(1),
  })
  .transform(({ file, line, character }) => ({
    file,
    position: createOneBasedPosition(line, character),
  }));

export const fileSchema = {
  file: z.string(),
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
