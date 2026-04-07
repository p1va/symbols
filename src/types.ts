import * as rpc from 'vscode-jsonrpc';
import { ChildProcessWithoutNullStreams } from 'child_process';
import {
  ClientCapabilities,
  Diagnostic,
  LogMessageParams,
  Range,
  ServerCapabilities,
} from 'vscode-languageserver-protocol';
// Import the position helpers used across the runtime.
import { createOneBasedPosition, toZeroBased } from './types/position.js';

// Import types separately so they are erased at runtime. This prevents
// Node from expecting the corresponding value exports during `pnpm dev`
// where the code is executed directly via `tsx`.
import type { OneBasedPosition, ZeroBasedPosition } from './types/position.js';
import type {
  WorkspaceLoaderState,
  WorkspaceLoader,
} from './workspace/types.js';

// Error codes for LSP operations
export enum ErrorCode {
  LSPError = 'LSP_ERROR',
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

// Session-scoped document state for documents currently known to the LSP session.
interface SessionDocument {
  uri: string;
  content: string;
  version: number;
  isOpen: boolean;
}

export type SessionDocuments = Map<string, SessionDocument>;

// Diagnostic provider information
export interface DiagnosticProvider {
  id: string;
  documentSelector?: Array<{
    language?: string;
    scheme?: string;
    pattern?: string;
  }>;
  interFileDependencies?: boolean;
  workspaceDiagnostics?: boolean;
}

// Stores for cached data
export interface DiagnosticsStore {
  diagnostics: Map<string, Diagnostic[]>;
  addDiagnostics(uri: string, diagnostics: Diagnostic[]): void;
  getDiagnostics(uri: string): Diagnostic[];
  clear(): void;
}

export interface DiagnosticProviderStore {
  providers: DiagnosticProvider[];
  addProvider(provider: DiagnosticProvider): void;
  getProviders(): DiagnosticProvider[];
  getProvidersForDocument(
    uri: string,
    languageId?: string
  ): DiagnosticProvider[];
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

export interface WorkspaceLoaderStore {
  state: WorkspaceLoaderState | null;
  loader: WorkspaceLoader | null;
  setState(state: WorkspaceLoaderState): void;
  setLoader(loader: WorkspaceLoader): void;
  getState(): WorkspaceLoaderState | null;
  getLoader(): WorkspaceLoader | null;
  updateState(method: string): void;
  isReady(): boolean;
}

export type { OneBasedPosition, ZeroBasedPosition };

export { createOneBasedPosition, toZeroBased };

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
// Additional error codes for validation (extending the main ErrorCode enum)
export enum ValidationErrorCode {
  InvalidPath = 'INVALID_PATH',
  PositionOutOfBounds = 'POSITION_OUT_OF_BOUNDS',
  WorkspaceNotReady = 'WORKSPACE_NOT_READY',
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

// Enhanced LSP operation error (now compatible with the base error interface)
interface LspOperationError extends BaseError {
  errorCode: ErrorCode;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ValidationError };

// Diagnostic entry for LSP diagnostics operations
export interface DiagnosticEntry {
  code: string;
  message: string;
  severity: number;
  range: Range;
  source: string;
}
