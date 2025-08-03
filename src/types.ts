/**
 * Core types for the LSP-to-MCP server
 * Based on the functional architecture defined in IMPLEMENTATION_PLAN.md
 */

import * as rpc from 'vscode-jsonrpc';
import { ChildProcessWithoutNullStreams } from 'child_process';
import {
  ClientCapabilities,
  Diagnostic,
  LogMessageParams,
  ServerCapabilities,
} from 'vscode-languageserver-protocol';

// Error codes for LSP operations
export enum ErrorCode {
  WorkspaceLoadInProgress = 'WORKSPACE_LOADING',
  FileNotFound = 'FILE_NOT_FOUND',
  LSPError = 'LSP_ERROR',
  InvalidPosition = 'INVALID_POSITION',
}

// Structured error for LSP operations (will be enhanced below with error hierarchy)
export interface LspOperationErrorLegacy {
  message: string;
  errorCode: ErrorCode;
  originalError?: Error;
}

// Helper functions to create different error types
export function createLspError(
  errorCode: ErrorCode,
  message: string,
  originalError?: Error
): LspOperationError {
  return originalError
    ? { message, errorCode, originalError }
    : { message, errorCode };
}

export function createValidationError(
  errorCode: ValidationErrorCode,
  message: string,
  originalError?: Error
): ValidationError {
  return originalError
    ? { message, errorCode, originalError }
    : { message, errorCode };
}

export function createFileSystemError(
  errorCode: FileSystemErrorCode,
  message: string,
  filePath?: string,
  originalError?: Error
): FileSystemError {
  const error: FileSystemError = { message, errorCode };
  if (filePath) error.filePath = filePath;
  if (originalError) error.originalError = originalError;
  return error;
}

export function createNetworkError(
  errorCode: NetworkErrorCode,
  message: string,
  originalError?: Error
): NetworkError {
  return originalError
    ? { message, errorCode, originalError }
    : { message, errorCode };
}

// Enhanced Result type with generic error parameter and improved discriminants
export type Result<T, E = LspOperationError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

// Helper function to wrap operations that might throw into Result
export function tryResult<T, E = LspOperationError>(
  fn: () => T,
  errorHandler?: (error: unknown) => E
): Result<T, E> {
  try {
    return { ok: true, data: fn() };
  } catch (error) {
    const handledError = errorHandler
      ? errorHandler(error)
      : (createLspError(
          ErrorCode.LSPError,
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error : undefined
        ) as E);

    return { ok: false, error: handledError };
  }
}

// Async version of tryResult
export async function tryResultAsync<T, E = LspOperationError>(
  fn: () => Promise<T>,
  errorHandler?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    const handledError = errorHandler
      ? errorHandler(error)
      : (createLspError(
          ErrorCode.LSPError,
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error : undefined
        ) as E);

    return { ok: false, error: handledError };
  }
}

// LSP Client state
export interface LspClient {
  connection: rpc.MessageConnection;
  isInitialized: boolean;
  clientCapabilities?: ClientCapabilities;
  serverCapabilities?: ServerCapabilities;
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
  clientCapabilities?: ClientCapabilities;
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

// Additional error codes for file system operations
export enum FileSystemErrorCode {
  FileNotFound = 'FILE_NOT_FOUND',
  PermissionDenied = 'PERMISSION_DENIED',
  FileReadError = 'FILE_READ_ERROR',
  FileWriteError = 'FILE_WRITE_ERROR',
}

// Additional error codes for network/LSP operations
export enum NetworkErrorCode {
  ConnectionTimeout = 'CONNECTION_TIMEOUT',
  ConnectionRefused = 'CONNECTION_REFUSED',
  ProtocolError = 'PROTOCOL_ERROR',
  ServerNotResponding = 'SERVER_NOT_RESPONDING',
}

// Base error interface for all error types
interface BaseError {
  message: string;
  originalError?: Error;
}

// Validation error type
export interface ValidationError extends BaseError {
  errorCode: ValidationErrorCode;
}

// File system error type
export interface FileSystemError extends BaseError {
  errorCode: FileSystemErrorCode;
  filePath?: string;
}

// Network/LSP error type
export interface NetworkError extends BaseError {
  errorCode: NetworkErrorCode;
}

// Enhanced LSP operation error (now compatible with the base error interface)
export interface LspOperationError extends BaseError {
  errorCode: ErrorCode;
}

// Union type for all possible errors in the system
export type ApplicationError =
  | LspOperationError
  | ValidationError
  | FileSystemError
  | NetworkError;

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ValidationError };
