import { getLogLevelName } from './log-level.js';

export interface WindowLogMessage {
  type: number;
  message: string;
}

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

export function formatWindowLogMessages(
  messages: WindowLogMessage[]
): string {
  if (messages.length === 0) {
    return 'No window log messages available';
  }

  return messages
    .map((message) => {
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
    })
    .join('\n');
}
