import type { DiagnosticEntry, DiagnosticsResult } from '../types.js';

export const DIAGNOSTICS_MAX_ENTRIES = 1_000;
export const DIAGNOSTIC_MESSAGE_MAX_CHARACTERS = 2_000;
export const DIAGNOSTIC_METADATA_MAX_CHARACTERS = 256;
const DIAGNOSTICS_OUTPUT_MAX_CHARACTERS = 64_000;

const MESSAGE_TRUNCATION_SUFFIX = '… [message truncated]';
const METADATA_TRUNCATION_SUFFIX = '… [field truncated]';
const OUTPUT_TRUNCATION_SUFFIX = '… [diagnostic truncated]';

export function diagnosticMessageToString(
  message: string | { value: string }
): string {
  return typeof message === 'string' ? message : message.value;
}

interface DiagnosticFormatOptions {
  maxEntries?: number;
  maxMessageCharacters?: number;
  maxCharacters?: number;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }

  return value;
}

function truncateText(
  value: string,
  maxCharacters: number,
  suffix: string
): string {
  requirePositiveInteger(maxCharacters, 'maxCharacters');

  if (value.length <= maxCharacters) {
    return value;
  }

  const boundedSuffix = suffix.slice(0, maxCharacters);
  const contentLength = Math.max(0, maxCharacters - boundedSuffix.length);
  return `${value.slice(0, contentLength)}${boundedSuffix}`;
}

export function truncateDiagnosticMessage(
  message: string,
  maxCharacters = DIAGNOSTIC_MESSAGE_MAX_CHARACTERS
): string {
  return truncateText(message, maxCharacters, MESSAGE_TRUNCATION_SUFFIX);
}

export function truncateDiagnosticMetadata(
  value: string,
  maxCharacters = DIAGNOSTIC_METADATA_MAX_CHARACTERS
): string {
  return truncateText(value, maxCharacters, METADATA_TRUNCATION_SUFFIX);
}

function getSeveritySymbol(severity: number): string {
  switch (severity) {
    case 1:
      return '✘';
    case 2:
      return '⚠';
    case 3:
      return 'ℹ';
    case 4:
      return '★';
    default:
      return '?';
  }
}

function getSeverityName(severity: number): string {
  switch (severity) {
    case 1:
      return 'Error';
    case 2:
      return 'Warning';
    case 3:
      return 'Info';
    case 4:
      return 'Hint';
    default:
      return 'Unknown';
  }
}

function formatDiagnostic(
  diagnostic: DiagnosticEntry,
  maxMessageCharacters: number
): string {
  const severitySymbol = getSeveritySymbol(diagnostic.severity);
  const severityName = getSeverityName(diagnostic.severity);
  const line = diagnostic.range.start.line + 1;
  const character = diagnostic.range.start.character + 1;
  const message = truncateDiagnosticMessage(
    diagnostic.message,
    maxMessageCharacters
  );
  const code = truncateDiagnosticMetadata(diagnostic.code);
  const source = truncateDiagnosticMetadata(diagnostic.source);
  return `${severitySymbol} @${line}:${character} [${severityName}][${code}] ${message} (${source})`;
}

function formatOmittedDiagnostics(count: number): string {
  const noun = count === 1 ? 'diagnostic' : 'diagnostics';
  return `… ${count.toLocaleString('en-US')} more ${noun} not shown`;
}

export function formatDiagnostics(
  result: DiagnosticsResult,
  options: DiagnosticFormatOptions = {}
): string {
  const maxEntries = requirePositiveInteger(
    options.maxEntries ?? DIAGNOSTICS_MAX_ENTRIES,
    'maxEntries'
  );
  const maxMessageCharacters = requirePositiveInteger(
    options.maxMessageCharacters ?? DIAGNOSTIC_MESSAGE_MAX_CHARACTERS,
    'maxMessageCharacters'
  );
  const maxCharacters =
    options.maxCharacters ?? DIAGNOSTICS_OUTPUT_MAX_CHARACTERS;
  if (!Number.isInteger(maxCharacters) || maxCharacters < 256) {
    throw new RangeError('maxCharacters must be an integer of at least 256');
  }
  const boundedDiagnostics = result.diagnostics.slice(0, maxEntries);
  const initiallyOmitted =
    Math.max(0, result.omittedCount) +
    Math.max(0, result.diagnostics.length - boundedDiagnostics.length);

  if (boundedDiagnostics.length === 0) {
    return initiallyOmitted > 0
      ? formatOmittedDiagnostics(initiallyOmitted)
      : 'No diagnostics found for this file.';
  }

  const lines = [...boundedDiagnostics]
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity - b.severity;
      }
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      return a.range.start.character - b.range.start.character;
    })
    .map((diagnostic) => formatDiagnostic(diagnostic, maxMessageCharacters));

  let shownCount = 0;
  let shownLength = 0;

  while (shownCount < lines.length) {
    const line = lines[shownCount]!;
    const nextShownLength =
      shownLength + line.length + (shownCount > 0 ? 1 : 0);
    const nextOmitted = initiallyOmitted + lines.length - shownCount - 1;
    const markerLength =
      nextOmitted > 0 ? formatOmittedDiagnostics(nextOmitted).length + 1 : 0;

    if (nextShownLength + markerLength > maxCharacters) {
      break;
    }

    shownCount += 1;
    shownLength = nextShownLength;
  }

  const totalOmitted = initiallyOmitted + lines.length - shownCount;
  const marker =
    totalOmitted > 0 ? formatOmittedDiagnostics(totalOmitted) : null;

  if (shownCount === 0) {
    const partialOmitted = initiallyOmitted + lines.length - 1;
    const partialMarker =
      partialOmitted > 0 ? formatOmittedDiagnostics(partialOmitted) : null;
    const markerSuffix = partialMarker ? `\n${partialMarker}` : '';
    const availableCharacters = Math.max(
      0,
      maxCharacters - OUTPUT_TRUNCATION_SUFFIX.length - markerSuffix.length
    );
    return `${lines[0]!.slice(0, availableCharacters)}${OUTPUT_TRUNCATION_SUFFIX}${markerSuffix}`;
  }

  return [...lines.slice(0, shownCount), ...(marker ? [marker] : [])].join(
    '\n'
  );
}
