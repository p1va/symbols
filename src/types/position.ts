/**
 * Position utilities for handling 1-based (MCP client) vs 0-based (LSP protocol) coordinates.
 *
 * This module provides branded types to prevent confusion between different coordinate systems:
 * - OneBasedPosition: Used by MCP clients (line 1, character 1 is first position)
 * - ZeroBasedPosition: Used by LSP protocol (line 0, character 0 is first position)
 *
 * The TypeScript compiler will enforce correct usage and prevent mixing the two systems.
 */

// 1. Define the base shape
type Position = {
  readonly line: number;
  readonly character: number;
};

// 2. Create the unique, "branded" types
export type OneBasedPosition = Position & { readonly __brand: 'OneBased' };
export type ZeroBasedPosition = Position & { readonly __brand: 'ZeroBased' };

/**
 * Creates a 1-based position with validation.
 * Used for MCP client inputs where line 1, character 1 is the first position.
 *
 * @param line - Line number (must be >= 1)
 * @param character - Character position (must be >= 1)
 * @returns A branded OneBasedPosition
 * @throws Error if line or character is less than 1
 */
export function createOneBasedPosition(
  line: number,
  character: number
): OneBasedPosition {
  if (line < 1 || character < 1) {
    throw new Error(
      `Invalid 1-based position: line=${line}, character=${character}. Both must be >= 1.`
    );
  }
  return { line, character } as OneBasedPosition;
}

/**
 * Creates a 0-based position with validation.
 * Used for LSP protocol communication where line 0, character 0 is the first position.
 *
 * @param line - Line number (must be >= 0)
 * @param character - Character position (must be >= 0)
 * @returns A branded ZeroBasedPosition
 * @throws Error if line or character is less than 0
 */
export function createZeroBasedPosition(
  line: number,
  character: number
): ZeroBasedPosition {
  if (line < 0 || character < 0) {
    throw new Error(
      `Invalid 0-based position: line=${line}, character=${character}. Both must be >= 0.`
    );
  }
  return { line, character } as ZeroBasedPosition;
}

/**
 * Converts a 1-based position to 0-based position.
 * Use this when converting from MCP client input to LSP protocol.
 *
 * @param pos - OneBasedPosition to convert
 * @returns ZeroBasedPosition (line-1, character-1)
 */
export function toZeroBased(pos: OneBasedPosition): ZeroBasedPosition {
  return createZeroBasedPosition(pos.line - 1, pos.character - 1);
}

/**
 * Converts a 0-based position to 1-based position.
 * Use this when converting from LSP protocol response to MCP client output.
 *
 * @param pos - ZeroBasedPosition to convert
 * @returns OneBasedPosition (line+1, character+1)
 */
export function toOneBased(pos: ZeroBasedPosition): OneBasedPosition {
  return createOneBasedPosition(pos.line + 1, pos.character + 1);
}

/**
 * Creates a 1-based position from raw numbers without validation.
 * Use this only when you're certain the input is already validated.
 *
 * @param line - Line number
 * @param character - Character position
 * @returns OneBasedPosition
 */
export function unsafeOneBasedPosition(
  line: number,
  character: number
): OneBasedPosition {
  return { line, character } as OneBasedPosition;
}

/**
 * Creates a 0-based position from raw numbers without validation.
 * Use this only when you're certain the input is already validated.
 *
 * @param line - Line number
 * @param character - Character position
 * @returns ZeroBasedPosition
 */
export function unsafeZeroBasedPosition(
  line: number,
  character: number
): ZeroBasedPosition {
  return { line, character } as ZeroBasedPosition;
}
