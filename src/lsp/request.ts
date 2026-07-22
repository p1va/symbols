import type { RequestParam, RequestType } from 'vscode-jsonrpc';

/**
 * Sends an LSP request whose descriptor couples the method, parameters, and
 * result type. ProtocolRequestType extends RequestType, so the official LSP
 * request descriptors can be passed directly.
 */
export type SendLspRequest = <TParams, TResult, TError>(
  type: RequestType<TParams, TResult, TError>,
  params: RequestParam<TParams>
) => Promise<TResult>;
