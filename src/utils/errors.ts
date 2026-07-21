function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function contextualError(context: string, cause: unknown): Error {
  return new Error(`${context}: ${errorMessage(cause)}`, { cause });
}
