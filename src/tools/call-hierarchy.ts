/**
 * Call Hierarchy Tool - Inspect incoming and outgoing call relationships
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createOneBasedPosition } from '../types.js';
import { prepareSymbolPositionRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import { formatFilePath, getSymbolKindName } from './utils.js';
import type {
  CallHierarchyDirection,
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  CallHierarchyResult,
  CallHierarchyTarget,
  Range,
} from '../types/lsp.js';

const MAX_TARGETS = 5;
const MAX_FILES_PER_SECTION = 6;
const MAX_CALLS_PER_FILE = 5;
// Keep the total section budget about 20% below the per-file ceiling product
// so broad call graphs leave headroom for more files before truncating.
const MAX_CALLS_PER_SECTION = 24;
const MAX_CALL_SITES_PER_ENTRY = 6;

const callHierarchySchema = {
  ...symbolPositionSchema,
  direction: z
    .enum(['incoming', 'outgoing', 'both'])
    .optional()
    .default('both')
    .describe('Which call relationships to include. Defaults to both.'),
} as const;

const callHierarchyZodSchema = z.object(callHierarchySchema);

type CallSectionEntry = CallHierarchyIncomingCall | CallHierarchyOutgoingCall;

export function registerCallHierarchyTool(
  server: McpServer,
  manager: LspManager
) {
  server.registerTool(
    'call_hierarchy',
    {
      title: 'Call Hierarchy',
      description:
        'Inspect incoming and outgoing call relationships for the callable symbol at a file position.',
      inputSchema: callHierarchySchema,
    },
    async (request) => {
      const validatedRequest = callHierarchyZodSchema.parse(request);
      const session = await manager.getSessionForFile(validatedRequest.file);

      const symbolRequest = {
        file: validatedRequest.file,
        position: createOneBasedPosition(
          validatedRequest.line,
          validatedRequest.character
        ),
      };

      const prepared = await prepareSymbolPositionRequest(
        session,
        symbolRequest
      );
      if (!prepared.ok) throw new Error(prepared.error.message);

      const result = await LspOperations.callHierarchy(
        session,
        prepared.data,
        validatedRequest.direction
      );
      if (!result.ok) throw new Error(result.error.message);

      const sections: string[] = [];
      const { cursorContext } = result.data;

      if (cursorContext) {
        sections.push(formatCursorContext(cursorContext));
      }

      sections.push(formatCallHierarchyResult(result.data.result));

      return {
        content: [
          {
            type: 'text' as const,
            text: sections.join('\n\n'),
          },
        ],
      };
    }
  );
}

function formatCallHierarchyResult(result: CallHierarchyResult): string {
  if (result.targets.length === 0) {
    return 'No call hierarchy item found at this position';
  }

  const directionLabel =
    result.direction === 'both' ? 'incoming and outgoing' : result.direction;
  const displayedTargets = result.targets.slice(0, MAX_TARGETS);

  let header = `Found ${result.targets.length} call hierarchy target${result.targets.length === 1 ? '' : 's'} with ${directionLabel} calls`;

  if (result.targets.length > displayedTargets.length) {
    header += ` (showing first ${displayedTargets.length})`;
  }

  const sections = [
    `${header}.`,
    displayedTargets
      .map((target, index) =>
        formatCallHierarchyTarget(target, result.direction, index)
      )
      .join('\n\n'),
  ];

  const omittedTargets = result.targets.length - displayedTargets.length;
  if (omittedTargets > 0) {
    sections.push(
      `... ${omittedTargets} more target${omittedTargets === 1 ? '' : 's'} not shown`
    );
  }

  return sections.join('\n\n');
}

function formatCallHierarchyTarget(
  target: CallHierarchyTarget,
  direction: CallHierarchyDirection,
  index: number
): string {
  const sections = [
    `Target ${index + 1}: ${formatCallHierarchyItem(target.item)}`,
    formatTargetSummary(target, direction),
  ];

  if (direction !== 'outgoing') {
    sections.push(
      formatCallSection({
        title: 'Incoming Calls',
        calls: target.incomingCalls ?? [],
        getItem: (call) => call.from,
        getRanges: (call) => call.fromRanges,
        callSiteLabel: 'calls at',
      })
    );
  }

  if (direction !== 'incoming') {
    sections.push(
      formatCallSection({
        title: 'Outgoing Calls',
        calls: target.outgoingCalls ?? [],
        getItem: (call) => call.to,
        getRanges: (call) => call.fromRanges,
        callSiteLabel: 'called at',
      })
    );
  }

  return sections.join('\n\n');
}

function formatTargetSummary(
  target: CallHierarchyTarget,
  direction: CallHierarchyDirection
): string {
  const parts: string[] = [];

  if (direction !== 'outgoing') {
    const incomingCalls = target.incomingCalls ?? [];
    const incomingFiles = countUniqueFiles(
      incomingCalls.map((call) => call.from.uri)
    );
    parts.push(
      `${incomingCalls.length} incoming call${incomingCalls.length === 1 ? '' : 's'} across ${incomingFiles} file${incomingFiles === 1 ? '' : 's'}`
    );
  }

  if (direction !== 'incoming') {
    const outgoingCalls = target.outgoingCalls ?? [];
    const outgoingFiles = countUniqueFiles(
      outgoingCalls.map((call) => call.to.uri)
    );
    parts.push(
      `${outgoingCalls.length} outgoing call${outgoingCalls.length === 1 ? '' : 's'} across ${outgoingFiles} file${outgoingFiles === 1 ? '' : 's'}`
    );
  }

  return `Summary: ${parts.join('; ')}`;
}

function formatCallHierarchyItem(item: CallHierarchyItem): string {
  const position = getCallHierarchyItemStart(item);
  const kind = getSymbolKindName(item.kind);
  const filePath = formatFilePath(item.uri);
  let result = `${item.name} (${kind}) - ${filePath}:${position.line + 1}:${position.character + 1}`;

  if (item.detail) {
    result += ` [${item.detail}]`;
  }

  return result;
}

function formatCallSection<TCall extends CallSectionEntry>({
  title,
  calls,
  getItem,
  getRanges,
  callSiteLabel,
}: {
  title: string;
  calls: TCall[];
  getItem: (call: TCall) => CallHierarchyItem;
  getRanges: (call: TCall) => Range[];
  callSiteLabel: string;
}): string {
  if (calls.length === 0) {
    return `${title}\nNone`;
  }

  const sortedCalls = [...calls].sort((left, right) =>
    compareItems(getItem(left), getItem(right))
  );
  const byFile = new Map<string, { displayPath: string; calls: TCall[] }>();

  for (const call of sortedCalls) {
    const item = getItem(call);
    const existing = byFile.get(item.uri);
    if (existing) {
      existing.calls.push(call);
    } else {
      byFile.set(item.uri, {
        displayPath: formatFilePath(item.uri),
        calls: [call],
      });
    }
  }

  const sections: string[] = [];
  let displayedFiles = 0;
  let remainingCalls = MAX_CALLS_PER_SECTION;

  for (const { displayPath, calls: fileCalls } of byFile.values()) {
    if (displayedFiles >= MAX_FILES_PER_SECTION || remainingCalls === 0) {
      break;
    }

    const displayedFileCalls = fileCalls.slice(
      0,
      Math.min(MAX_CALLS_PER_FILE, remainingCalls)
    );

    sections.push(`${displayPath} (${fileCalls.length})`);

    for (const call of displayedFileCalls) {
      const item = getItem(call);
      const position = getCallHierarchyItemStart(item);
      sections.push(
        `  ${item.name} (${getSymbolKindName(item.kind)}) @${position.line + 1}:${position.character + 1}`
      );

      const ranges = getRanges(call);
      if (ranges.length > 0) {
        sections.push(`    ${callSiteLabel}: ${formatCallSiteRanges(ranges)}`);
      }
    }

    const omittedInFile = fileCalls.length - displayedFileCalls.length;
    if (omittedInFile > 0) {
      sections.push(
        `  ... ${omittedInFile} more call${omittedInFile === 1 ? '' : 's'} in this file`
      );
    }

    displayedFiles += 1;
    remainingCalls -= displayedFileCalls.length;
  }

  const displayedCalls = MAX_CALLS_PER_SECTION - remainingCalls;
  let header = `${title} (${calls.length} across ${byFile.size} file${byFile.size === 1 ? '' : 's'}`;
  if (displayedCalls < calls.length) {
    header += `, showing ${displayedCalls}`;
  }
  header += ')';

  const omittedCalls = calls.length - displayedCalls;
  if (omittedCalls > 0) {
    const omittedFiles = byFile.size - displayedFiles;
    let omissionSummary = `... ${omittedCalls} more call${omittedCalls === 1 ? '' : 's'} not shown`;
    if (omittedFiles > 0) {
      omissionSummary += ` across ${omittedFiles} more file${omittedFiles === 1 ? '' : 's'}`;
    }
    sections.push(omissionSummary);
  }

  return [header, ...sections].join('\n');
}

function formatCallSiteRanges(ranges: Range[]): string {
  const positions = Array.from(
    new Set(
      ranges.map(
        (range) => `${range.start.line + 1}:${range.start.character + 1}`
      )
    )
  );
  const displayedPositions = positions.slice(0, MAX_CALL_SITES_PER_ENTRY);
  let result = displayedPositions.join(', ');

  const omittedPositions = positions.length - displayedPositions.length;
  if (omittedPositions > 0) {
    result += ` (+${omittedPositions} more)`;
  }

  return result;
}

function countUniqueFiles(uris: string[]): number {
  return new Set(uris).size;
}

function compareItems(
  left: CallHierarchyItem,
  right: CallHierarchyItem
): number {
  const byPath = left.uri.localeCompare(right.uri);

  if (byPath !== 0) {
    return byPath;
  }

  const leftPosition = getCallHierarchyItemStart(left);
  const rightPosition = getCallHierarchyItemStart(right);

  if (leftPosition.line !== rightPosition.line) {
    return leftPosition.line - rightPosition.line;
  }

  return leftPosition.character - rightPosition.character;
}

function getCallHierarchyItemStart(item: CallHierarchyItem) {
  // Some servers omit selectionRange despite the LSP spec requiring it.
  return item.selectionRange?.start ?? item.range.start;
}
