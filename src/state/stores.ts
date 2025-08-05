/**
 * Store implementations for caching LSP data
 */

import { Diagnostic } from 'vscode-languageserver-protocol';
import { DiagnosticsStore, DiagnosticProviderStore, DiagnosticProvider, WindowLogStore, LogMessage } from '../types.js';

export function createDiagnosticsStore(): DiagnosticsStore {
  const diagnostics = new Map<string, Diagnostic[]>();

  return {
    diagnostics,
    addDiagnostics(uri: string, diagnostics: Diagnostic[]) {
      this.diagnostics.set(uri, diagnostics);
    },
    getDiagnostics(uri: string): Diagnostic[] {
      return this.diagnostics.get(uri) || [];
    },
    clear() {
      this.diagnostics.clear();
    },
  };
}

export function createDiagnosticProviderStore(): DiagnosticProviderStore {
  const providers: DiagnosticProvider[] = [];

  return {
    providers,
    addProvider(provider: DiagnosticProvider) {
      // Avoid duplicates based on id
      const existingIndex = this.providers.findIndex(p => p.id === provider.id);
      if (existingIndex >= 0) {
        this.providers[existingIndex] = provider;
      } else {
        this.providers.push(provider);
      }
    },
    getProviders(): DiagnosticProvider[] {
      return [...this.providers];
    },
    getProvidersForDocument(uri: string, languageId?: string): DiagnosticProvider[] {
      return this.providers.filter(provider => {
        if (!provider.documentSelector) return true;
        
        return provider.documentSelector.some(selector => {
          // Check language match
          if (selector.language && languageId && selector.language !== languageId) {
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
    },
    clear() {
      this.providers.length = 0;
    },
  };
}

export function createWindowLogStore(): WindowLogStore {
  const messages: LogMessage[] = [];

  return {
    messages,
    addMessage(message: LogMessage) {
      this.messages.push(message);
    },
    getMessages(): LogMessage[] {
      return [...this.messages];
    },
    clear() {
      this.messages.length = 0;
    },
  };
}
