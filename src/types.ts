/**
 * Core types for the LSP-to-MCP server
 * Based on the functional architecture defined in IMPLEMENTATION_PLAN.md
 */

import * as rpc from 'vscode-jsonrpc';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { Diagnostic, LogMessageParams } from 'vscode-languageserver-protocol';

// Error codes for LSP operations
export enum ErrorCode {
  WorkspaceLoadInProgress = 'WORKSPACE_LOADING',
  FileNotFound = 'FILE_NOT_FOUND',
  LSPError = 'LSP_ERROR',
  InvalidPosition = 'INVALID_POSITION',
}

// Structured error for LSP operations
export interface LspOperationError {
  message: string;
  errorCode: ErrorCode;
  originalError?: Error;
}

// Helper function to create LspOperationError
export function createLspError(
  errorCode: ErrorCode,
  message: string,
  originalError?: Error
): LspOperationError {
  return originalError
    ? { message, errorCode, originalError }
    : { message, errorCode };
}

// Result type for consistent error handling
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: LspOperationError };

// LSP Client state
export interface LspClient {
  connection: rpc.MessageConnection;
  isInitialized: boolean;
  capabilities?: any;
  processId?: number;
}

// LSP Client creation result with child process for shutdown handling
export interface LspClientResult {
  client: LspClient;
  process: ChildProcessWithoutNullStreams;
}

// Workspace loading state
export interface WorkspaceState {
  isLoading: boolean;
  isReady: boolean;
  loadingStartedAt?: Date;
  readyAt?: Date;
}

// Configuration for LSP initialization
export interface LspConfig {
  workspaceUri: string;
  workspaceName: string;
  clientCapabilities?: any;
  preloadFiles?: string[]; // Array of file paths to open during initialization
}

// File lifecycle management
export interface PreloadedFile {
  uri: string;
  content: string;
  version: number;
  isOpen: boolean;
}

export type PreloadedFiles = Map<string, PreloadedFile>;

// Stores for cached data
export interface DiagnosticsStore {
  diagnostics: Map<string, Diagnostic[]>;
  addDiagnostics(uri: string, diagnostics: Diagnostic[]): void;
  getDiagnostics(uri: string): Diagnostic[];
  clear(): void;
}

// Use the official LogMessageParams type
export type LogMessage = LogMessageParams;

export interface WindowLogStore {
  messages: LogMessage[];
  addMessage(message: LogMessage): void;
  getMessages(): LogMessage[];
  clear(): void;
}

// Import and re-export position types
import {
  OneBasedPosition,
  ZeroBasedPosition,
  createOneBasedPosition,
  createZeroBasedPosition,
  toZeroBased,
  toOneBased,
} from './types/position.js';

export {
  OneBasedPosition,
  ZeroBasedPosition,
  createOneBasedPosition,
  createZeroBasedPosition,
  toZeroBased,
  toOneBased,
};

// Tool request types (using branded position types)
export interface SymbolPositionRequest {
  file: string;
  position: OneBasedPosition;
}

export interface FileRequest {
  file: string;
}

export interface SearchRequest {
  query: string;
}

export interface RenameRequest {
  file: string;
  position: OneBasedPosition;
  newName: string;
}

// Context object that bundles cross-cutting services
export interface LspContext {
  readonly client: LspClient;
  readonly preloadedFiles: PreloadedFiles;
  readonly diagnosticsStore: DiagnosticsStore;
  readonly windowLogStore: WindowLogStore;
  readonly workspaceState: WorkspaceState;
}

// Additional error codes for validation (extending the main ErrorCode enum)
export enum ValidationErrorCode {
  InvalidPath = 'INVALID_PATH',
  PositionOutOfBounds = 'POSITION_OUT_OF_BOUNDS',
  WorkspaceNotReady = 'WORKSPACE_NOT_READY',
}

// Validation error type (compatible with LspOperationError)
export interface ValidationError {
  message: string;
  errorCode: ErrorCode | ValidationErrorCode;
  originalError?: Error;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ValidationError };
