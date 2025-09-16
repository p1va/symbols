/**
 * Type validation utilities for MCP tool arguments
 */

import { z } from 'zod';
import {
  symbolPositionSchema,
  fileSchema,
  searchSchema,
  renameSchema,
} from './schemas.js';

// Create Zod objects from schemas for validation
const symbolPositionZodSchema = z.object(symbolPositionSchema);
const fileZodSchema = z.object(fileSchema);
const searchZodSchema = z.object(searchSchema);
const renameZodSchema = z.object(renameSchema);

// Export inferred types
export type SymbolPositionRequest = z.infer<typeof symbolPositionZodSchema>;
export type FileRequest = z.infer<typeof fileZodSchema>;
export type SearchRequest = z.infer<typeof searchZodSchema>;
export type RenameRequest = z.infer<typeof renameZodSchema>;

/**
 * Validates and parses symbol position arguments
 */
export function validateSymbolPosition(
  request: unknown
): SymbolPositionRequest {
  return symbolPositionZodSchema.parse(request);
}

/**
 * Validates and parses file arguments
 */
export function validateFile(request: unknown): FileRequest {
  return fileZodSchema.parse(request);
}

/**
 * Validates and parses search arguments
 */
export function validateSearch(request: unknown): SearchRequest {
  return searchZodSchema.parse(request);
}

/**
 * Validates and parses rename arguments
 */
export function validateRename(request: unknown): RenameRequest {
  return renameZodSchema.parse(request);
}
