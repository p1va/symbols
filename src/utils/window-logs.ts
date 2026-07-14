import { getLogLevelName } from './log-level.js';

interface WindowLogMessage {
  type: number;
  message: string;
}

interface WindowLogFormatOptions {
  omittedMessages?: number;
  maxCharacters?: number;
}

const DEFAULT_WINDOW_LOG_MAX_OUTPUT_CHARACTERS = 64_000;

function getLogLevelSymbol(type: number): string {
  switch (type) {
    case 1:
      return '✘';
    case 2:
      return '⚠';
    case 3:
      return 'ℹ';
    case 4:
      return '•';
    default:
      return '?';
  }
}

function formatWindowLogMessage(message: WindowLogMessage): string {
  const symbol = getLogLevelSymbol(message.type);
  const level = getLogLevelName(message.type);
  const trimmedMessage = message.message.trim();
  const contextMatch = trimmedMessage.match(/^\[([^\]]+)\]/);
  const context = contextMatch ? contextMatch[1] : '';
  const content = contextMatch
    ? trimmedMessage.substring(contextMatch[0].length).trim()
    : trimmedMessage;

  if (context) {
    return `${symbol} [${level}] [${context}] ${content}`;
  }

  return `${symbol} [${level}] ${content}`;
}

function formatOmittedMessages(count: number): string {
  const noun = count === 1 ? 'message' : 'messages';
  return `… ${count.toLocaleString('en-US')} older ${noun} omitted; showing the latest available messages`;
}

export function formatWindowLogMessages(
  messages: WindowLogMessage[],
  options: WindowLogFormatOptions = {}
): string {
  const omittedMessages = Math.max(0, options.omittedMessages ?? 0);
  const maxCharacters =
    options.maxCharacters ?? DEFAULT_WINDOW_LOG_MAX_OUTPUT_CHARACTERS;

  if (!Number.isInteger(maxCharacters) || maxCharacters < 256) {
    throw new RangeError('maxCharacters must be an integer of at least 256');
  }

  if (messages.length === 0 && omittedMessages === 0) {
    return 'No window log messages available';
  }

  const lines = messages.map(formatWindowLogMessage);
  let startIndex = lines.length;
  let contentLength = 0;

  while (startIndex > 0) {
    const nextStartIndex = startIndex - 1;
    const line = lines[nextStartIndex]!;
    const nextContentLength =
      contentLength + line.length + (contentLength > 0 ? 1 : 0);
    const nextOmittedCount = omittedMessages + nextStartIndex;
    const markerLength =
      nextOmittedCount > 0
        ? formatOmittedMessages(nextOmittedCount).length + 1
        : 0;

    if (markerLength + nextContentLength > maxCharacters) {
      break;
    }

    startIndex = nextStartIndex;
    contentLength = nextContentLength;
  }

  const totalOmitted = omittedMessages + startIndex;
  const marker = totalOmitted > 0 ? formatOmittedMessages(totalOmitted) : null;

  if (startIndex === lines.length && lines.length > 0) {
    const partiallyShownOmitted = omittedMessages + lines.length - 1;
    const partialMarker =
      partiallyShownOmitted > 0
        ? formatOmittedMessages(partiallyShownOmitted)
        : null;
    const markerPrefix = partialMarker ? `${partialMarker}\n` : '';
    const truncationSuffix = '… [output truncated]';
    const availableCharacters = Math.max(
      0,
      maxCharacters - markerPrefix.length - truncationSuffix.length
    );
    const newestLine = lines[lines.length - 1]!;
    return `${markerPrefix}${newestLine.slice(0, availableCharacters)}${truncationSuffix}`;
  }

  return [...(marker ? [marker] : []), ...lines.slice(startIndex)].join('\n');
}
