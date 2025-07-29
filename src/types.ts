/**
 * Core types for the LSP-to-MCP server
 * Based on the functional architecture defined in IMPLEMENTATION_PLAN.md
 */

import * as rpc from 'vscode-jsonrpc';
import { Diagnostic } from 'vscode-languageserver-protocol';

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

// Simple log message type (since WindowLogMessage isn't exported)
export interface LogMessage {
  type: number;
  message: string;
}

export interface WindowLogStore {
  messages: LogMessage[];
  addMessage(message: LogMessage): void;
  getMessages(): LogMessage[];
  clear(): void;
}

// Position coordinate conversion utilities
export interface Position {
  line: number;
  character: number;
}

// Convert 1-based (MCP/user) to 0-based (LSP)
export function toLspPosition(pos: Position): Position {
  return {
    line: pos.line - 1,
    character: pos.character - 1,
  };
}

// Convert 0-based (LSP) to 1-based (MCP/user)
export function fromLspPosition(pos: Position): Position {
  return {
    line: pos.line + 1,
    character: pos.character + 1,
  };
}

// Tool request types (1-based coordinates)
export interface SymbolPositionRequest {
  file: string;
  line: number;
  character: number;
}

export interface FileRequest {
  file: string;
}

export interface SearchRequest {
  query: string;
}

export interface RenameRequest extends SymbolPositionRequest {
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
