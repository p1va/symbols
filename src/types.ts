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

// Enhanced Result type with generic error parameter and improved discriminants
export type Result<T, E = Error> =
  { ok: true; data: T } | { ok: false; error: E };

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
  workspaceReadyDelayMs?: number; // Optional wait before marking workspace ready
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
  omittedDiagnostics: Map<string, number>;
  addDiagnostics(uri: string, diagnostics: Diagnostic[]): void;
  getDiagnostics(uri: string): Diagnostic[];
  getOmittedCount(uri: string): number;
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
  addMessage(message: LogMessage): void;
  getMessages(): LogMessage[];
  getDroppedCount(): number;
  clear(): void;
}

export interface WorkspaceLoaderStore {
  state: WorkspaceLoaderState | null;
  loader: WorkspaceLoader | null;
  setState(state: WorkspaceLoaderState): void;
  setLoader(loader: WorkspaceLoader): void;
  getState(): WorkspaceLoaderState | null;
  getLoader(): WorkspaceLoader | null;
  updateState(method: string, params?: unknown): void;
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

export type ValidationResult =
  { valid: true } | { valid: false; error: ValidationError };

// Diagnostic entry for LSP diagnostics operations
export interface DiagnosticEntry {
  code: string;
  message: string;
  severity: number;
  range: Range;
  source: string;
}

export interface DiagnosticsResult {
  diagnostics: DiagnosticEntry[];
  omittedCount: number;
}
