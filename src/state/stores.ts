/**
 * Store implementations for caching LSP data
 */

import { Diagnostic } from 'vscode-languageserver-protocol';
import {
  DiagnosticsStore,
  DiagnosticProviderStore,
  DiagnosticProvider,
  WindowLogStore,
  LogMessage,
  WorkspaceLoaderStore,
} from '../types.js';
import { WorkspaceLoaderState, WorkspaceLoader } from '../workspace/types.js';
import logger from '../utils/logger.js';
import {
  DIAGNOSTIC_MESSAGE_MAX_CHARACTERS,
  DIAGNOSTIC_METADATA_MAX_CHARACTERS,
  DIAGNOSTICS_MAX_ENTRIES,
  diagnosticMessageToString,
  truncateDiagnosticMessage,
  truncateDiagnosticMetadata,
} from '../utils/diagnostics.js';

export const DEFAULT_WINDOW_LOG_MAX_MESSAGES = 1_000;
const DEFAULT_WINDOW_LOG_MAX_MESSAGE_CHARACTERS = 8_000;

const WINDOW_LOG_MESSAGE_TRUNCATION_SUFFIX = '… [message truncated]';

interface WindowLogStoreOptions {
  maxMessages?: number;
  maxMessageCharacters?: number;
}

interface DiagnosticsStoreOptions {
  maxDiagnosticsPerUri?: number;
  maxMessageCharacters?: number;
  maxMetadataCharacters?: number;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }

  return value;
}

function truncateWindowLogMessage(
  message: LogMessage,
  maxCharacters: number
): LogMessage {
  if (message.message.length <= maxCharacters) {
    return message;
  }

  const truncationSuffix = WINDOW_LOG_MESSAGE_TRUNCATION_SUFFIX.slice(
    0,
    maxCharacters
  );
  const contentLength = Math.max(0, maxCharacters - truncationSuffix.length);
  return {
    ...message,
    message: `${message.message.slice(0, contentLength)}${truncationSuffix}`,
  };
}

export function createDiagnosticsStore(
  options: DiagnosticsStoreOptions = {}
): DiagnosticsStore {
  const maxDiagnosticsPerUri = requirePositiveInteger(
    options.maxDiagnosticsPerUri ?? DIAGNOSTICS_MAX_ENTRIES,
    'maxDiagnosticsPerUri'
  );
  const maxMessageCharacters = requirePositiveInteger(
    options.maxMessageCharacters ?? DIAGNOSTIC_MESSAGE_MAX_CHARACTERS,
    'maxMessageCharacters'
  );
  const maxMetadataCharacters = requirePositiveInteger(
    options.maxMetadataCharacters ?? DIAGNOSTIC_METADATA_MAX_CHARACTERS,
    'maxMetadataCharacters'
  );
  const diagnostics = new Map<string, Diagnostic[]>();
  const omittedDiagnostics = new Map<string, number>();

  return {
    diagnostics,
    omittedDiagnostics,
    addDiagnostics(uri: string, incomingDiagnostics: Diagnostic[]) {
      if (incomingDiagnostics.length === 0) {
        this.diagnostics.delete(uri);
        this.omittedDiagnostics.delete(uri);
        return;
      }

      const storedDiagnostics = incomingDiagnostics
        .slice(0, maxDiagnosticsPerUri)
        .map((diagnostic): Diagnostic => ({
          range: diagnostic.range,
          message: truncateDiagnosticMessage(
            diagnosticMessageToString(diagnostic.message),
            maxMessageCharacters
          ),
          ...(diagnostic.severity !== undefined
            ? { severity: diagnostic.severity }
            : {}),
          ...(diagnostic.code !== undefined
            ? {
                code:
                  typeof diagnostic.code === 'number'
                    ? diagnostic.code
                    : truncateDiagnosticMetadata(
                        diagnostic.code,
                        maxMetadataCharacters
                      ),
              }
            : {}),
          ...(diagnostic.source !== undefined
            ? {
                source: truncateDiagnosticMetadata(
                  diagnostic.source,
                  maxMetadataCharacters
                ),
              }
            : {}),
        }));
      const omittedCount =
        incomingDiagnostics.length - storedDiagnostics.length;

      this.diagnostics.set(uri, storedDiagnostics);
      if (omittedCount > 0) {
        this.omittedDiagnostics.set(uri, omittedCount);
      } else {
        this.omittedDiagnostics.delete(uri);
      }
    },
    getDiagnostics(uri: string): Diagnostic[] {
      return this.diagnostics.get(uri) || [];
    },
    getOmittedCount(uri: string): number {
      return this.omittedDiagnostics.get(uri) || 0;
    },
    clear() {
      this.diagnostics.clear();
      this.omittedDiagnostics.clear();
    },
  };
}

export function createDiagnosticProviderStore(): DiagnosticProviderStore {
  const providers: DiagnosticProvider[] = [];

  return {
    providers,
    addProvider(provider: DiagnosticProvider) {
      // Avoid duplicates based on id
      const existingIndex = this.providers.findIndex(
        (p) => p.id === provider.id
      );
      if (existingIndex >= 0) {
        this.providers[existingIndex] = provider;
      } else {
        this.providers.push(provider);
      }
    },
    getProviders(): DiagnosticProvider[] {
      return [...this.providers];
    },
    getProvidersForDocument(
      uri: string,
      languageId?: string
    ): DiagnosticProvider[] {
      const filteredProviders = this.providers.filter((provider) => {
        if (!provider.documentSelector) return true;

        return provider.documentSelector.some((selector) => {
          // Check language match
          if (
            selector.language &&
            languageId &&
            selector.language !== languageId
          ) {
            return false;
          }

          // Check scheme match (assuming file:// scheme)
          if (selector.scheme && !uri.startsWith(`${selector.scheme}:`)) {
            return false;
          }

          // Check pattern match (simplified glob matching)
          if (selector.pattern) {
            const regex = new RegExp(selector.pattern.replace(/\*/g, '.*'));
            if (!regex.test(uri)) {
              return false;
            }
          }

          return true;
        });
      });

      logger.debug('Retrieving providers for document', {
        uri,
        languageId,
        providerCount: filteredProviders.length,
      });

      return filteredProviders;
    },
    clear() {
      this.providers.length = 0;
    },
  };
}

export function createWindowLogStore(
  options: WindowLogStoreOptions = {}
): WindowLogStore {
  const maxMessages = requirePositiveInteger(
    options.maxMessages ?? DEFAULT_WINDOW_LOG_MAX_MESSAGES,
    'maxMessages'
  );
  const maxMessageCharacters = requirePositiveInteger(
    options.maxMessageCharacters ?? DEFAULT_WINDOW_LOG_MAX_MESSAGE_CHARACTERS,
    'maxMessageCharacters'
  );
  const messages: LogMessage[] = [];
  let droppedCount = 0;

  return {
    addMessage(message: LogMessage) {
      const storedMessage = truncateWindowLogMessage(
        message,
        maxMessageCharacters
      );
      logger.debug('[LSP-LOG]', storedMessage);
      messages.push(storedMessage);

      const overflow = messages.length - maxMessages;
      if (overflow > 0) {
        messages.splice(0, overflow);
        droppedCount += overflow;
      }
    },
    getMessages(): LogMessage[] {
      return [...messages];
    },
    getDroppedCount(): number {
      return droppedCount;
    },
    clear() {
      messages.length = 0;
      droppedCount = 0;
    },
  };
}

export function createWorkspaceLoaderStore(): WorkspaceLoaderStore {
  let state: WorkspaceLoaderState | null = null;
  let loader: WorkspaceLoader | null = null;

  return {
    state,
    loader,
    setState(newState: WorkspaceLoaderState) {
      state = newState;
      this.state = newState;
    },
    setLoader(newLoader: WorkspaceLoader) {
      loader = newLoader;
      this.loader = newLoader;
    },
    getState(): WorkspaceLoaderState | null {
      return state;
    },
    getLoader(): WorkspaceLoader | null {
      return loader;
    },
    updateState(method: string, params?: unknown) {
      if (state && loader?.handleNotification) {
        const newState = loader.handleNotification(state, method, params);
        this.setState(newState);
      }
    },
    isReady(): boolean {
      if (!state || !loader) {
        return false;
      }
      return loader.isReady(state);
    },
  };
}
