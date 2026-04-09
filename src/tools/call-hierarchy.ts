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
} from '../types/lsp.js';

const MAX_TARGETS = 5;
const MAX_FILES_PER_SECTION = 6;
const MAX_CALLS_PER_FILE = 5;
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
        calls: target.incomingCalls,
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
        calls: target.outgoingCalls,
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
    const incomingFiles = countUniqueFiles(
      target.incomingCalls.map((call) => call.from.uri)
    );
    parts.push(
      `${target.incomingCalls.length} incoming call${target.incomingCalls.length === 1 ? '' : 's'} across ${incomingFiles} file${incomingFiles === 1 ? '' : 's'}`
    );
  }

  if (direction !== 'incoming') {
    const outgoingFiles = countUniqueFiles(
      target.outgoingCalls.map((call) => call.to.uri)
    );
    parts.push(
      `${target.outgoingCalls.length} outgoing call${target.outgoingCalls.length === 1 ? '' : 's'} across ${outgoingFiles} file${outgoingFiles === 1 ? '' : 's'}`
    );
  }

  return `Summary: ${parts.join('; ')}`;
}

function formatCallHierarchyItem(item: CallHierarchyItem): string {
  const position = item.selectionRange?.start ?? item.range.start;
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
  getRanges: (
    call: TCall
  ) => Array<{ start: { line: number; character: number } }>;
  callSiteLabel: string;
}): string {
  if (calls.length === 0) {
    return `${title}\nNone`;
  }

  const sortedCalls = [...calls].sort((left, right) =>
    compareItems(getItem(left), getItem(right))
  );
  const byFile = new Map<string, TCall[]>();

  for (const call of sortedCalls) {
    const filePath = formatFilePath(getItem(call).uri);
    const existing = byFile.get(filePath);
    if (existing) {
      existing.push(call);
    } else {
      byFile.set(filePath, [call]);
    }
  }

  const allFilePaths = Array.from(byFile.keys()).sort((left, right) =>
    left.localeCompare(right)
  );
  const sections: string[] = [];
  let displayedCalls = 0;
  let displayedFiles = 0;
  let remainingCalls = MAX_CALLS_PER_SECTION;

  for (const filePath of allFilePaths) {
    if (displayedFiles >= MAX_FILES_PER_SECTION || remainingCalls === 0) {
      break;
    }

    const fileCalls = byFile.get(filePath) ?? [];
    const displayedFileCalls = fileCalls.slice(
      0,
      Math.min(MAX_CALLS_PER_FILE, remainingCalls)
    );

    if (displayedFileCalls.length === 0) {
      break;
    }

    sections.push(`${filePath} (${fileCalls.length})`);

    for (const call of displayedFileCalls) {
      const item = getItem(call);
      const position = item.selectionRange?.start ?? item.range.start;
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
    displayedCalls += displayedFileCalls.length;
    remainingCalls -= displayedFileCalls.length;
  }

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

function formatCallSiteRanges(
  ranges: Array<{ start: { line: number; character: number } }>
): string {
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
  return new Set(uris.map((uri) => formatFilePath(uri))).size;
}

function compareItems(
  left: CallHierarchyItem,
  right: CallHierarchyItem
): number {
  const leftPath = formatFilePath(left.uri);
  const rightPath = formatFilePath(right.uri);
  const byPath = leftPath.localeCompare(rightPath);

  if (byPath !== 0) {
    return byPath;
  }

  const leftPosition = left.selectionRange?.start ?? left.range.start;
  const rightPosition = right.selectionRange?.start ?? right.range.start;

  if (leftPosition.line !== rightPosition.line) {
    return leftPosition.line - rightPosition.line;
  }

  return leftPosition.character - rightPosition.character;
}
