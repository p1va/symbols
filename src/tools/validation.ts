/**
 * Type validation utilities for MCP tool arguments
 */

import { z } from 'zod';
import {
  diagnosticsSchema,
  fileSchema,
  logsSchema,
  renameSchema,
  searchSchema,
  setupSchema,
  symbolPositionSchema,
} from './schemas.js';

// Create Zod objects from schemas for validation
const symbolPositionZodSchema = z.object(symbolPositionSchema);
const fileZodSchema = z.object(fileSchema);
const searchZodSchema = z.object(searchSchema);
const renameZodSchema = z.object(renameSchema);
const logsZodSchema = z.object(logsSchema);
const setupZodSchema = z.object(setupSchema);
const diagnosticsZodSchema = z.object(diagnosticsSchema);

// Export inferred types
export type SymbolPositionRequest = z.infer<typeof symbolPositionZodSchema>;
export type FileRequest = z.infer<typeof fileZodSchema>;
export type SearchRequest = z.infer<typeof searchZodSchema>;
export type RenameRequest = z.infer<typeof renameZodSchema>;
export type LogsRequest = z.infer<typeof logsZodSchema>;
export type SetupRequest = z.infer<typeof setupZodSchema>;
export type DiagnosticsRequest = z.infer<typeof diagnosticsZodSchema>;

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
 * Validates and parses log arguments
 */
export function validateLogs(request: unknown): LogsRequest {
  return logsZodSchema.parse(request);
}

/**
 * Validates and parses setup arguments
 */
export function validateSetup(request: unknown): SetupRequest {
  return setupZodSchema.parse(request || {});
}

/**
 * Validates and parses diagnostics arguments
 */
export function validateDiagnostics(request: unknown): DiagnosticsRequest {
  return diagnosticsZodSchema.parse(request);
}
