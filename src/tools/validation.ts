/**
 * Type validation utilities for MCP tool arguments
 */

import { z } from 'zod';
import {
  diagnosticsSchema,
  fileSchema,
  renameSchema,
  searchSchema,
  symbolPositionSchema,
} from './schemas.js';

// Create Zod objects from schemas for validation
const symbolPositionZodSchema = z.object(symbolPositionSchema);
const fileZodSchema = z.object(fileSchema);
const searchZodSchema = z.object(searchSchema);
const renameZodSchema = z.object(renameSchema);
const diagnosticsZodSchema = z.object(diagnosticsSchema);

// Inferred request types used by the validators in this module
type SymbolPositionRequest = z.infer<typeof symbolPositionZodSchema>;
type FileRequest = z.infer<typeof fileZodSchema>;
type SearchRequest = z.infer<typeof searchZodSchema>;
type RenameRequest = z.infer<typeof renameZodSchema>;
type DiagnosticsRequest = z.infer<typeof diagnosticsZodSchema>;

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

/**
 * Validates and parses diagnostics arguments
 */
export function validateDiagnostics(request: unknown): DiagnosticsRequest {
  return diagnosticsZodSchema.parse(request);
}
