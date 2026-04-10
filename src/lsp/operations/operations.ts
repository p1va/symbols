/**
 * Public LspOperations - MCP-backed navigation operations.
 */

import { setTimeout as delay } from 'node:timers/promises';
import {
  createLspError,
  DiagnosticEntry,
  ErrorCode,
  Result,
  tryResult,
  tryResultAsync,
  DiagnosticsStore,
  DiagnosticProviderStore,
  DiagnosticProvider,
} from '../../types.js';
import {
  PreparedFileRequest,
  PreparedRenameRequest,
  PreparedSymbolPositionRequest,
  PreparedWorkspaceRequest,
} from '../../preparation.js';
import { DEFAULT_SEARCH_WARMUP_WINDOW_MS } from '../../config/lsp-config.js';
import logger from '../../utils/logger.js';
import {
  CallHierarchyDirection,
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  CallHierarchyResult,
  CompletionItem,
  CompletionList,
  CompletionParams,
  CompletionResult,
  DocumentDiagnosticParams,
  FlattenedSymbol,
  getDocumentSymbols,
  Hover,
  Location,
  LogMessageResult,
  Range,
  ReferenceParams,
  RenameParams,
  RenameResult,
  SymbolInformation,
  SymbolInspection,
  // Internal result types
  SymbolReference,
  SymbolSearchResult,
  TextDocumentPositionParams,
  WorkspaceEdit,
  WorkspaceSymbol,
  WorkspaceSymbolParams,
} from '../../types/lsp.js';
import { CompletionTriggerKind } from 'vscode-languageserver-protocol';
import type {
  CursorContextOperationResult,
  LspSession,
  SessionDocumentScope,
} from '../../runtime/lsp-session.js';

const SEARCH_WARMUP_RETRY_DELAYS_MS = [250, 500, 1000, 1500] as const;

function getSearchWarmupDeadlineMs(session: LspSession): number | null {
  const readyAt = session.getWorkspaceState().readyAt;
  if (!readyAt) {
    return null;
  }

  const warmupWindowMs =
    session.getProfile().config.search?.warmup_window_ms ??
    DEFAULT_SEARCH_WARMUP_WINDOW_MS;

  if (warmupWindowMs <= 0) {
    return null;
  }

  return readyAt.getTime() + warmupWindowMs;
}

function transformWorkspaceSymbols(
  symbols: WorkspaceSymbol[] | SymbolInformation[]
): SymbolSearchResult[] {
  return Array.isArray(symbols)
    ? symbols.map((symbol) => {
        if (
          'location' in symbol &&
          symbol.location &&
          'range' in symbol.location
        ) {
          return {
            name: symbol.name,
            kind: symbol.kind,
            location: {
              uri: symbol.location.uri,
              range: symbol.location.range,
            },
            containerName: symbol.containerName || '',
          };
        }

        return {
          name: symbol.name,
          kind: symbol.kind,
          location: {
            uri: symbol.location.uri || '',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          },
          containerName: symbol.containerName || '',
        };
      })
    : [];
}

async function requestWorkspaceSymbols(
  session: LspSession,
  params: WorkspaceSymbolParams
): Promise<SymbolSearchResult[]> {
  const symbols: WorkspaceSymbol[] | SymbolInformation[] = await session.request(
    'workspace/symbol',
    params
  );

  return transformWorkspaceSymbols(symbols);
}

export async function inspectSymbol(
  session: LspSession,
  prepared: PreparedSymbolPositionRequest
): Promise<Result<CursorContextOperationResult<SymbolInspection>>> {
  logger.info(
    `Inspect for ${prepared.filePath} at ${prepared.position.line}:${prepared.position.character}`
  );

  return await session.executeWithCursorContext(
    'inspect',
    prepared.filePath,
    prepared.position,
    'transient',
    async (scope) => {
      return await tryResultAsync(
        async () => {
          const positionParams: TextDocumentPositionParams = {
            textDocument: { uri: scope.uri },
            position: prepared.lspPosition,
          };

          const [
            hoverResult,
            definitionResult,
            typeDefinitionResult,
            implementationResult,
          ] = await Promise.allSettled([
            scope.request<Hover>('textDocument/hover', positionParams),
            scope.request<Location | Location[]>(
              'textDocument/definition',
              positionParams
            ),
            scope.request<Location | Location[]>(
              'textDocument/typeDefinition',
              positionParams
            ),
            scope.request<Location | Location[]>(
              'textDocument/implementation',
              positionParams
            ),
          ]);

          const inspectData: SymbolInspection = {
            hover:
              hoverResult.status === 'fulfilled' ? hoverResult.value : null,
            definition:
              definitionResult.status === 'fulfilled'
                ? definitionResult.value
                : null,
            typeDefinition:
              typeDefinitionResult.status === 'fulfilled'
                ? typeDefinitionResult.value
                : null,
            implementation:
              implementationResult.status === 'fulfilled'
                ? implementationResult.value
                : null,
          };

          // Transform locations back to 1-based coordinates for user display
          const transformLocations = (
            locations: Location | Location[] | null
          ) => {
            if (!locations || !Array.isArray(locations)) return locations;
            return locations.map((loc) => ({
              ...loc,
              range: {
                ...loc.range,
                start: {
                  line: loc.range.start.line + 1,
                  character: loc.range.start.character + 1,
                },
                end: {
                  line: loc.range.end.line + 1,
                  character: loc.range.end.character + 1,
                },
              },
            }));
          };

          inspectData.definition = transformLocations(inspectData.definition);
          inspectData.typeDefinition = transformLocations(
            inspectData.typeDefinition
          );
          inspectData.implementation = transformLocations(
            inspectData.implementation
          );

          return inspectData;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Inspect symbol failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

export async function findReferences(
  session: LspSession,
  prepared: PreparedSymbolPositionRequest
): Promise<Result<CursorContextOperationResult<SymbolReference[]>>> {
  return await session.executeWithCursorContext(
    'references',
    prepared.filePath,
    prepared.position,
    'transient',
    async (scope) => {
      return await tryResultAsync(
        async () => {
          const params: ReferenceParams = {
            textDocument: { uri: scope.uri },
            position: prepared.lspPosition,
            context: {
              includeDeclaration: true,
            },
          };

          const references: Location[] = await scope.request(
            'textDocument/references',
            params
          );

          if (!Array.isArray(references)) {
            return [];
          }

          // Transform LSP response to our format
          const results: SymbolReference[] = references.map((ref) => ({
            uri: ref.uri,
            range: ref.range,
            // Convert back to 1-based for user display
            line: ref.range.start.line + 1,
            character: ref.range.start.character + 1,
          }));

          return results;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Find references failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

export async function callHierarchy(
  session: LspSession,
  prepared: PreparedSymbolPositionRequest,
  direction: CallHierarchyDirection = 'both'
): Promise<Result<CursorContextOperationResult<CallHierarchyResult>>> {
  return await session.executeWithCursorContext(
    'callHierarchy',
    prepared.filePath,
    prepared.position,
    'transient',
    async (scope) => {
      return await tryResultAsync(
        async () => {
          const positionParams: TextDocumentPositionParams = {
            textDocument: { uri: scope.uri },
            position: prepared.lspPosition,
          };

          const preparedItems = await scope.request<CallHierarchyItem[] | null>(
            'textDocument/prepareCallHierarchy',
            positionParams
          );

          if (!Array.isArray(preparedItems) || preparedItems.length === 0) {
            return {
              direction,
              targets: [],
            };
          }

          // Language servers typically return only one or two prepared items.
          // Keep the per-target requests parallel for latency and revisit if we
          // encounter servers that fan out much more aggressively.
          const targets = await Promise.all(
            preparedItems.map(async (item) => {
              const [incomingCalls, outgoingCalls] = await Promise.all([
                direction === 'outgoing'
                  ? Promise.resolve<CallHierarchyIncomingCall[] | null>(null)
                  : scope
                      .request<
                        CallHierarchyIncomingCall[] | null
                      >('callHierarchy/incomingCalls', { item })
                      .then((calls) => (Array.isArray(calls) ? calls : [])),
                direction === 'incoming'
                  ? Promise.resolve<CallHierarchyOutgoingCall[] | null>(null)
                  : scope
                      .request<
                        CallHierarchyOutgoingCall[] | null
                      >('callHierarchy/outgoingCalls', { item })
                      .then((calls) => (Array.isArray(calls) ? calls : [])),
              ]);

              return {
                item,
                incomingCalls,
                outgoingCalls,
              };
            })
          );

          return {
            direction,
            targets,
          };
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Call hierarchy failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

export async function completion(
  session: LspSession,
  prepared: PreparedSymbolPositionRequest
): Promise<Result<CursorContextOperationResult<CompletionResult[]>>> {
  return await session.executeWithCursorContext(
    'completion',
    prepared.filePath,
    prepared.position,
    'transient',
    async (scope) => {
      return await tryResultAsync(
        async () => {
          const params: CompletionParams = {
            textDocument: { uri: scope.uri },
            position: prepared.lspPosition,
            context: {
              triggerKind: CompletionTriggerKind.Invoked,
            },
          };

          const completionResult: CompletionList | CompletionItem[] =
            await scope.request('textDocument/completion', params);

          let completions: CompletionItem[] = [];

          if (Array.isArray(completionResult)) {
            completions = completionResult;
          } else if (
            completionResult &&
            typeof completionResult === 'object' &&
            'items' in completionResult
          ) {
            // CompletionList format - items is always CompletionItem[] per LSP spec
            completions = completionResult.items;
          }

          // Transform LSP completion items to our format
          const results: CompletionResult[] = completions.map((item) => ({
            label: item.label,
            kind: item.kind || 1, // Default to Text if kind is undefined
            detail: item.detail || '',
            documentation: item.documentation || '',
            insertText: item.insertText || item.label,
            filterText: item.filterText || item.label,
            sortText: item.sortText || item.label,
            ...(item.textEdit && 'range' in item.textEdit
              ? {
                  textEdit: {
                    newText: item.textEdit.newText,
                    range: {
                      start: {
                        line: item.textEdit.range.start.line + 1,
                        character: item.textEdit.range.start.character + 1,
                      },
                      end: {
                        line: item.textEdit.range.end.line + 1,
                        character: item.textEdit.range.end.character + 1,
                      },
                    },
                  },
                }
              : {}),
          }));

          return results;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Code completion failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

export async function searchSymbols(
  session: LspSession,
  prepared: PreparedWorkspaceRequest
): Promise<Result<SymbolSearchResult[]>> {
  return await tryResultAsync(
    async () => {
      const params: WorkspaceSymbolParams = {
        query: prepared.query,
      };

      let results = await requestWorkspaceSymbols(session, params);
      const warmupDeadlineAt = getSearchWarmupDeadlineMs(session);

      if (results.length === 0 && warmupDeadlineAt !== null) {
        for (const retryDelayMs of SEARCH_WARMUP_RETRY_DELAYS_MS) {
          const remainingWarmupMs = warmupDeadlineAt - Date.now();
          if (remainingWarmupMs <= 0) {
            break;
          }

          await delay(Math.min(retryDelayMs, remainingWarmupMs));
          results = await requestWorkspaceSymbols(session, params);

          if (results.length > 0) {
            logger.info('Workspace symbol search warmed up after retry', {
              profile: session.getProfile().name,
              query: prepared.query,
            });
            break;
          }
        }
      }

      return results;
    },
    (error) =>
      createLspError(
        ErrorCode.LSPError,
        `Workspace symbol search failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
  );
}

export async function outlineSymbols(
  session: LspSession,
  prepared: PreparedFileRequest
): Promise<Result<FlattenedSymbol[]>> {
  return await session.executeWithDocumentLifecycle(
    prepared.filePath,
    'transient',
    async (scope): Promise<Result<FlattenedSymbol[]>> => {
      return await tryResultAsync(
        async () =>
          await getDocumentSymbols(
            async (method, params) => await scope.request(method, params),
            scope.uri
          ),
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Document symbol request failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

export async function getDiagnostics(
  session: LspSession,
  prepared: PreparedFileRequest
): Promise<Result<DiagnosticEntry[]>> {
  const diagnosticsStore = session.getDiagnosticsStore();
  const diagnosticProviderStore = session.getDiagnosticProviderStore();
  const profile = session.getProfile();
  const lspName = profile.name;
  const lspConfig = profile.config;
  const filePath = prepared.filePath;

  // Determine diagnostic strategy from LSP configuration
  const strategy = lspConfig?.diagnostics?.strategy || 'push';

  logger.debug('Using diagnostic strategy', { strategy, lspName, filePath });

  return await session.executeWithDocumentLifecycle(
    filePath,
    'transient',
    async (scope): Promise<Result<DiagnosticEntry[]>> => {
      return await tryResultAsync(
        async () => {
          if (strategy === 'pull') {
            return await getPullDiagnostics(
              async (method, params) => await scope.request(method, params),
              diagnosticProviderStore,
              scope.uri
            );
          } else {
            return await getPushDiagnostics(diagnosticsStore, scope.uri);
          }
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Get diagnostics failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

async function getPushDiagnostics(
  diagnosticsStore: DiagnosticsStore,
  uri: string
): Promise<DiagnosticEntry[]> {
  // Give LSP a moment to send diagnostics after opening the file
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Get diagnostics from store (populated by push notifications)
  const diagnostics = diagnosticsStore.getDiagnostics(uri);

  // Convert to DiagnosticEntry format
  const diagnosticEntries: DiagnosticEntry[] = diagnostics.map(
    (diagnostic) => ({
      code: diagnostic.code?.toString() || 'unknown',
      message: diagnostic.message,
      severity: diagnostic.severity || 1, // Error by default
      range: diagnostic.range,
      source: diagnostic.source || 'unknown',
    })
  );

  return diagnosticEntries;
}

async function getPullDiagnostics(
  request: SessionDocumentScope['request'],
  diagnosticProviderStore: DiagnosticProviderStore,
  uri: string
): Promise<DiagnosticEntry[]> {
  const allDiagnostics: DiagnosticEntry[] = [];

  // Get all diagnostic providers that support this document
  const providers: DiagnosticProvider[] =
    diagnosticProviderStore.getProvidersForDocument(uri);

  logger.debug('Found diagnostic providers for document', {
    uri,
    providerCount: providers.length,
    providerIds: providers.map((p) => p.id),
  });

  // Request diagnostics from each provider
  for (const provider of providers) {
    try {
      logger.debug('Requesting diagnostics from provider', {
        providerId: provider.id,
        uri,
      });

      const params: DocumentDiagnosticParams = {
        textDocument: { uri },
        identifier: provider.id,
        // previousResultId omitted for first request
      };

      const diagnosticReport = await request('textDocument/diagnostic', params);

      // Handle different types of diagnostic reports
      if ((diagnosticReport as { kind?: string }).kind === 'full') {
        const fullReport = diagnosticReport as { items: unknown[] };

        // Convert diagnostics to our format
        const diagnosticEntries: DiagnosticEntry[] = fullReport.items.map(
          (diagnostic: unknown) => {
            const d = diagnostic as {
              code?: { value: string | number } | string | number;
              message: string;
              severity?: number;
              range: Range;
              source?: string;
            };
            return {
              code:
                typeof d.code === 'object' && d.code && 'value' in d.code
                  ? String(d.code.value)
                  : d.code
                    ? String(d.code)
                    : 'unknown',
              message: d.message,
              severity: d.severity || 1, // Error by default
              range: d.range,
              source: d.source || provider.id,
            };
          }
        );

        allDiagnostics.push(...diagnosticEntries);

        logger.debug('Retrieved diagnostics from provider', {
          providerId: provider.id,
          diagnosticCount: diagnosticEntries.length,
        });
      } else {
        logger.debug('Provider returned unchanged diagnostics', {
          providerId: provider.id,
        });
      }
    } catch (error) {
      logger.warn('Failed to get diagnostics from provider', {
        providerId: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with other providers
    }
  }

  logger.info('Completed pull diagnostics request', {
    uri,
    totalDiagnostics: allDiagnostics.length,
    providerCount: providers.length,
  });

  return allDiagnostics;
}

export async function rename(
  session: LspSession,
  prepared: PreparedRenameRequest
): Promise<Result<CursorContextOperationResult<RenameResult>>> {
  return await session.executeWithCursorContext(
    'rename',
    prepared.filePath,
    prepared.position,
    'transient',
    async (scope) => {
      return await tryResultAsync(
        async () => {
          const params: RenameParams = {
            textDocument: { uri: scope.uri },
            position: prepared.lspPosition,
            newName: prepared.newName,
          };

          const workspaceEdit: WorkspaceEdit = await scope.request(
            'textDocument/rename',
            params
          );

          if (!workspaceEdit || typeof workspaceEdit !== 'object') {
            return {};
          }

          // Transform LSP WorkspaceEdit response to our format
          const changes: RenameResult = {};

          const addEdits = (
            fileUri: string,
            edits: Array<{
              range: Range;
              newText: string;
            }>
          ) => {
            const fileChanges = edits.map((edit) => ({
              range: edit.range,
              newText: edit.newText,
              // Convert positions back to 1-based for user display
              startLine: edit.range.start.line + 1,
              startCharacter: edit.range.start.character + 1,
              endLine: edit.range.end.line + 1,
              endCharacter: edit.range.end.character + 1,
            }));

            changes[fileUri] = [...(changes[fileUri] || []), ...fileChanges];
          };

          if ('changes' in workspaceEdit && workspaceEdit.changes) {
            for (const [fileUri, edits] of Object.entries(
              workspaceEdit.changes
            )) {
              addEdits(fileUri, edits);
            }
          }

          if (
            'documentChanges' in workspaceEdit &&
            Array.isArray(workspaceEdit.documentChanges)
          ) {
            for (const change of workspaceEdit.documentChanges) {
              if (!change || typeof change !== 'object') {
                continue;
              }

              if (!('textDocument' in change) || !('edits' in change)) {
                continue;
              }

              const fileUri = change.textDocument?.uri;
              const edits = Array.isArray(change.edits) ? change.edits : [];
              if (!fileUri || edits.length === 0) {
                continue;
              }

              addEdits(fileUri, edits);
            }
          }

          if (Object.keys(changes).length === 0) {
            logger.info('Rename returned no file edits', {
              hasChanges:
                'changes' in workspaceEdit &&
                !!workspaceEdit.changes &&
                Object.keys(workspaceEdit.changes).length > 0,
              hasDocumentChanges:
                'documentChanges' in workspaceEdit &&
                Array.isArray(workspaceEdit.documentChanges) &&
                workspaceEdit.documentChanges.length > 0,
            });
          }

          return changes;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Rename symbol failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

export function logs(session: LspSession): Result<LogMessageResult[]> {
  const windowLogStore = session.getWindowLogStore();

  // Using the new tryResult helper to eliminate try/catch boilerplate
  return tryResult(
    () => windowLogStore.getMessages(),
    (error) =>
      createLspError(
        ErrorCode.LSPError,
        `Failed to get window log messages: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
  );
}
