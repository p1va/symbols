/**
 * Store implementations for caching LSP data
 */

import { Diagnostic } from 'vscode-languageserver-protocol';
import { DiagnosticsStore, WindowLogStore, LogMessage } from './types';

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
