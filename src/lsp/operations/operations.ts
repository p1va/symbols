/**
 * Public LspOperations - MCP-backed navigation operations.
 */

import { setTimeout as delay } from 'node:timers/promises';
import {
  DiagnosticEntry,
  DiagnosticsResult,
  DiagnosticsStore,
  DiagnosticProviderStore,
  DiagnosticProvider,
} from '../../types.js';
import {
  PreparedFileRequest,
  PreparedWorkspaceRequest,
  ResolvedRenameTarget,
  ResolvedSymbolTarget,
} from '../../preparation.js';
import { DEFAULT_SEARCH_WARMUP_WINDOW_MS } from '../../config/lsp-config.js';
import logger from '../../utils/logger.js';
import {
  DIAGNOSTIC_MESSAGE_MAX_CHARACTERS,
  DIAGNOSTICS_MAX_ENTRIES,
  diagnosticMessageToString,
  truncateDiagnosticMessage,
  truncateDiagnosticMetadata,
} from '../../utils/diagnostics.js';
import {
  CallHierarchyDirection,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  CallHierarchyResult,
  CompletionItem,
  CompletionParams,
  CompletionResult,
  DocumentDiagnosticParams,
  FlattenedSymbol,
  getDocumentSymbols,
  LogMessageResult,
  ReferenceParams,
  RenameParams,
  RenameResult,
  SymbolInformation,
  SymbolInspection,
  // Internal result types
  SymbolReference,
  SymbolSearchResult,
  TextDocumentPositionParams,
  WorkspaceSymbol,
  WorkspaceSymbolParams,
} from '../../types/lsp.js';
import {
  CallHierarchyIncomingCallsRequest,
  CallHierarchyOutgoingCallsRequest,
  CallHierarchyPrepareRequest,
  CompletionRequest,
  CompletionTriggerKind,
  DefinitionRequest,
  DocumentDiagnosticRequest,
  DocumentDiagnosticReportKind,
  HoverRequest,
  ImplementationRequest,
  Location,
  ReferencesRequest,
  RenameRequest,
  TextDocumentEdit,
  TextEdit,
  TypeDefinitionRequest,
  WorkspaceSymbolRequest,
} from 'vscode-languageserver-protocol';
import type { LocationLink } from 'vscode-languageserver-protocol';
import type {
  CursorContextOperationResult,
  LspSession,
  SessionDocumentScope,
} from '../../runtime/lsp-session.js';
import { contextualError } from '../../utils/errors.js';

const SEARCH_WARMUP_RETRY_DELAYS_MS = [250, 500, 1000, 1500] as const;

async function runOperation<T>(
  context: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw contextualError(context, error);
  }
}

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
  symbols: WorkspaceSymbol[] | SymbolInformation[] | null
): SymbolSearchResult[] {
  return (symbols ?? []).map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    location: Location.is(symbol.location)
      ? symbol.location
      : {
          uri: symbol.location.uri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        },
    containerName: symbol.containerName ?? '',
  }));
}

async function requestWorkspaceSymbols(
  session: LspSession,
  params: WorkspaceSymbolParams
): Promise<SymbolSearchResult[]> {
  const symbols = await session.request(WorkspaceSymbolRequest.type, params);

  return transformWorkspaceSymbols(symbols);
}

function normalizeLocations(
  response: Location | Location[] | LocationLink[] | null
): Location[] {
  if (response === null) {
    return [];
  }

  if (Location.is(response)) {
    return [response];
  }

  return response.map((location) =>
    Location.is(location)
      ? location
      : {
          uri: location.targetUri,
          range: location.targetSelectionRange,
        }
  );
}

export async function inspectSymbol(
  session: LspSession,
  target: ResolvedSymbolTarget
): Promise<CursorContextOperationResult<SymbolInspection>> {
  logger.info(
    `Inspect for ${target.filePath} at ${target.position.line}:${target.position.character}`
  );

  return await runOperation(
    'Inspect symbol failed',
    async () =>
      await session.executeWithCursorContext(
        'inspect',
        target.filePath,
        target.position,
        'transient',
        async (scope) => {
          const positionParams: TextDocumentPositionParams = {
            textDocument: { uri: scope.uri },
            position: target.lspPosition,
          };

          const [
            hoverResult,
            definitionResult,
            typeDefinitionResult,
            implementationResult,
          ] = await Promise.allSettled([
            scope.request(HoverRequest.type, positionParams),
            scope.request(DefinitionRequest.type, positionParams),
            scope.request(TypeDefinitionRequest.type, positionParams),
            scope.request(ImplementationRequest.type, positionParams),
          ]);

          return {
            hover:
              hoverResult.status === 'fulfilled' ? hoverResult.value : null,
            definition:
              definitionResult.status === 'fulfilled'
                ? normalizeLocations(definitionResult.value)
                : [],
            typeDefinition:
              typeDefinitionResult.status === 'fulfilled'
                ? normalizeLocations(typeDefinitionResult.value)
                : [],
            implementation:
              implementationResult.status === 'fulfilled'
                ? normalizeLocations(implementationResult.value)
                : [],
          } satisfies SymbolInspection;
        }
      )
  );
}

export async function findReferences(
  session: LspSession,
  target: ResolvedSymbolTarget
): Promise<CursorContextOperationResult<SymbolReference[]>> {
  return await runOperation(
    'Find references failed',
    async () =>
      await session.executeWithCursorContext(
        'references',
        target.filePath,
        target.position,
        'transient',
        async (scope) => {
          const params: ReferenceParams = {
            textDocument: { uri: scope.uri },
            position: target.lspPosition,
            context: {
              includeDeclaration: true,
            },
          };

          const references = await scope.request(
            ReferencesRequest.type,
            params
          );

          return (references ?? []) satisfies SymbolReference[];
        }
      )
  );
}

export async function callHierarchy(
  session: LspSession,
  target: ResolvedSymbolTarget,
  direction: CallHierarchyDirection = 'both'
): Promise<CursorContextOperationResult<CallHierarchyResult>> {
  return await runOperation(
    'Call hierarchy failed',
    async () =>
      await session.executeWithCursorContext(
        'callHierarchy',
        target.filePath,
        target.position,
        'transient',
        async (scope) => {
          const positionParams: TextDocumentPositionParams = {
            textDocument: { uri: scope.uri },
            position: target.lspPosition,
          };

          const preparedItems = await scope.request(
            CallHierarchyPrepareRequest.type,
            positionParams
          );

          if (!preparedItems || preparedItems.length === 0) {
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
                      .request(CallHierarchyIncomingCallsRequest.type, { item })
                      .then((calls) => calls ?? []),
                direction === 'incoming'
                  ? Promise.resolve<CallHierarchyOutgoingCall[] | null>(null)
                  : scope
                      .request(CallHierarchyOutgoingCallsRequest.type, { item })
                      .then((calls) => calls ?? []),
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
        }
      )
  );
}

export async function completion(
  session: LspSession,
  target: ResolvedSymbolTarget
): Promise<CursorContextOperationResult<CompletionResult[]>> {
  return await runOperation(
    'Code completion failed',
    async () =>
      await session.executeWithCursorContext(
        'completion',
        target.filePath,
        target.position,
        'transient',
        async (scope) => {
          const params: CompletionParams = {
            textDocument: { uri: scope.uri },
            position: target.lspPosition,
            context: {
              triggerKind: CompletionTriggerKind.Invoked,
            },
          };

          const completionResult = await scope.request(
            CompletionRequest.type,
            params
          );
          const completions: CompletionItem[] = completionResult
            ? Array.isArray(completionResult)
              ? completionResult
              : completionResult.items
            : [];

          // Transform LSP completion items to our format
          const results: CompletionResult[] = completions.map((item) => ({
            label: item.label,
            kind: item.kind || 1, // Default to Text if kind is undefined
            detail: item.detail || '',
            documentation: item.documentation || '',
            insertText: item.insertText || item.label,
            filterText: item.filterText || item.label,
            sortText: item.sortText || item.label,
            ...(item.textEdit && TextEdit.is(item.textEdit)
              ? {
                  textEdit: {
                    newText: item.textEdit.newText,
                    range: item.textEdit.range,
                  },
                }
              : {}),
          }));

          return results;
        }
      )
  );
}

export async function searchSymbols(
  session: LspSession,
  prepared: PreparedWorkspaceRequest
): Promise<SymbolSearchResult[]> {
  return await runOperation('Workspace symbol search failed', async () => {
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
  });
}

export async function outlineSymbols(
  session: LspSession,
  prepared: PreparedFileRequest
): Promise<FlattenedSymbol[]> {
  return await runOperation(
    'Document symbol request failed',
    async () =>
      await session.executeWithDocumentLifecycle(
        prepared.filePath,
        'transient',
        async (scope) =>
          await getDocumentSymbols(
            async (type, params) => await scope.request(type, params),
            scope.uri
          )
      )
  );
}

export async function getDiagnostics(
  session: LspSession,
  prepared: PreparedFileRequest
): Promise<DiagnosticsResult> {
  const diagnosticsStore = session.getDiagnosticsStore();
  const diagnosticProviderStore = session.getDiagnosticProviderStore();
  const profile = session.getProfile();
  const lspName = profile.name;
  const lspConfig = profile.config;
  const filePath = prepared.filePath;

  // Determine diagnostic strategy from LSP configuration
  const strategy = lspConfig?.diagnostics?.strategy || 'push';

  logger.debug('Using diagnostic strategy', { strategy, lspName, filePath });

  return await runOperation(
    'Get diagnostics failed',
    async () =>
      await session.executeWithDocumentLifecycle(
        filePath,
        'transient',
        async (scope) => {
          if (strategy === 'pull') {
            return await getPullDiagnostics(
              async (type, params) => await scope.request(type, params),
              diagnosticProviderStore,
              scope.uri
            );
          } else {
            return await getPushDiagnostics(
              diagnosticsStore,
              scope.uri,
              lspConfig.diagnostics.wait_timeout_ms
            );
          }
        }
      )
  );
}

async function getPushDiagnostics(
  diagnosticsStore: DiagnosticsStore,
  uri: string,
  waitTimeoutMs: number
): Promise<DiagnosticsResult> {
  // Give the LSP its configured window to publish diagnostics after opening the file.
  await delay(waitTimeoutMs);

  // Get diagnostics from store (populated by push notifications)
  const diagnostics = diagnosticsStore.getDiagnostics(uri);

  // Convert to DiagnosticEntry format
  const diagnosticEntries: DiagnosticEntry[] = diagnostics.map(
    (diagnostic) => ({
      code: diagnostic.code?.toString() || 'unknown',
      message: diagnosticMessageToString(diagnostic.message),
      severity: diagnostic.severity || 1, // Error by default
      range: diagnostic.range,
      source: diagnostic.source || 'unknown',
    })
  );

  return {
    diagnostics: diagnosticEntries,
    omittedCount: diagnosticsStore.getOmittedCount(uri),
  };
}

async function getPullDiagnostics(
  request: SessionDocumentScope['request'],
  diagnosticProviderStore: DiagnosticProviderStore,
  uri: string
): Promise<DiagnosticsResult> {
  const allDiagnostics: DiagnosticEntry[] = [];
  let omittedCount = 0;

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

      const diagnosticReport = await request(
        DocumentDiagnosticRequest.type,
        params
      );

      if (diagnosticReport.kind === DocumentDiagnosticReportKind.Full) {
        const remainingCapacity = Math.max(
          0,
          DIAGNOSTICS_MAX_ENTRIES - allDiagnostics.length
        );
        const boundedItems = diagnosticReport.items.slice(0, remainingCapacity);
        omittedCount += diagnosticReport.items.length - boundedItems.length;

        const diagnosticEntries: DiagnosticEntry[] = boundedItems.map(
          (diagnostic) => ({
            code: truncateDiagnosticMetadata(
              diagnostic.code === undefined
                ? 'unknown'
                : String(diagnostic.code)
            ),
            message: truncateDiagnosticMessage(
              diagnosticMessageToString(diagnostic.message),
              DIAGNOSTIC_MESSAGE_MAX_CHARACTERS
            ),
            severity: diagnostic.severity ?? 1,
            range: diagnostic.range,
            source: truncateDiagnosticMetadata(
              diagnostic.source ?? provider.id
            ),
          })
        );

        allDiagnostics.push(...diagnosticEntries);

        logger.debug('Retrieved diagnostics from provider', {
          providerId: provider.id,
          diagnosticCount: diagnosticEntries.length,
          omittedDiagnosticCount:
            diagnosticReport.items.length - diagnosticEntries.length,
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
    omittedDiagnosticCount: omittedCount,
  });

  return { diagnostics: allDiagnostics, omittedCount };
}

export async function rename(
  session: LspSession,
  target: ResolvedRenameTarget
): Promise<CursorContextOperationResult<RenameResult>> {
  return await runOperation(
    'Rename symbol failed',
    async () =>
      await session.executeWithCursorContext(
        'rename',
        target.filePath,
        target.position,
        'transient',
        async (scope) => {
          const params: RenameParams = {
            textDocument: { uri: scope.uri },
            position: target.lspPosition,
            newName: target.newName,
          };

          const workspaceEdit = await scope.request(RenameRequest.type, params);

          if (workspaceEdit === null) {
            return {};
          }

          // Transform LSP WorkspaceEdit response to our format
          const changes: RenameResult = {};

          const addEdits = (
            fileUri: string,
            edits: TextDocumentEdit['edits']
          ) => {
            const fileChanges = edits.map((edit) => {
              if (!TextEdit.is(edit)) {
                throw new Error(
                  `Rename returned an unsupported snippet edit for ${fileUri}`
                );
              }

              return {
                range: edit.range,
                newText: edit.newText,
              };
            });

            changes[fileUri] = [...(changes[fileUri] || []), ...fileChanges];
          };

          if (workspaceEdit.changes) {
            for (const [fileUri, edits] of Object.entries(
              workspaceEdit.changes
            )) {
              addEdits(fileUri, edits);
            }
          }

          if (workspaceEdit.documentChanges) {
            for (const change of workspaceEdit.documentChanges) {
              if (!TextDocumentEdit.is(change)) {
                throw new Error(
                  `Rename returned unsupported file operation '${change.kind}'; no files were changed`
                );
              }

              if (change.edits.length === 0) {
                continue;
              }

              addEdits(change.textDocument.uri, change.edits);
            }
          }

          if (Object.keys(changes).length === 0) {
            logger.info('Rename returned no file edits', {
              hasChanges:
                !!workspaceEdit.changes &&
                Object.keys(workspaceEdit.changes).length > 0,
              hasDocumentChanges:
                !!workspaceEdit.documentChanges &&
                workspaceEdit.documentChanges.length > 0,
            });
          }

          return changes;
        }
      )
  );
}

export function logs(session: LspSession): LogMessageResult[] {
  return session.getWindowLogStore().getMessages();
}
