/**
 * Call Hierarchy Tool - Inspect incoming and outgoing call relationships
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveSymbolTarget } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import {
  createSignaturePreview,
  enrichCodeSnippets,
  type EnrichmentRequest,
} from './enrichment.js';
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
import { formatZeroBasedPosition } from '../types/position.js';
import { createOneBasedPosition } from '../types.js';
import { textToolResult } from './responses.js';

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
      const target = await resolveSymbolTarget(session, {
        file: validatedRequest.file,
        position: createOneBasedPosition(
          validatedRequest.line,
          validatedRequest.character
        ),
      });

      const result = await LspOperations.callHierarchy(
        session,
        target,
        validatedRequest.direction
      );

      const sections: string[] = [];
      const { cursorContext } = result;
      const workspacePath = session.getProfile().workspacePath;

      if (cursorContext) {
        sections.push(formatCursorContext(cursorContext, workspacePath));
      }

      sections.push(
        await formatCallHierarchyResult(result.result, workspacePath)
      );

      return textToolResult(sections.join('\n\n'));
    }
  );
}

async function formatCallHierarchyResult(
  result: CallHierarchyResult,
  workspacePath?: string
): Promise<string> {
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
    (
      await Promise.all(
        displayedTargets.map((target, index) =>
          formatCallHierarchyTarget(
            target,
            result.direction,
            index,
            workspacePath
          )
        )
      )
    ).join('\n\n'),
  ];

  const omittedTargets = result.targets.length - displayedTargets.length;
  if (omittedTargets > 0) {
    sections.push(
      `... ${omittedTargets} more target${omittedTargets === 1 ? '' : 's'} not shown`
    );
  }

  return sections.join('\n\n');
}

async function formatCallHierarchyTarget(
  target: CallHierarchyTarget,
  direction: CallHierarchyDirection,
  index: number,
  workspacePath?: string
): Promise<string> {
  const sections = [
    `Target ${index + 1}: ${formatCallHierarchyItem(target.item, workspacePath)}`,
    formatTargetSummary(target, direction),
  ];

  if (direction !== 'outgoing') {
    sections.push(
      await formatCallSection({
        title: 'Incoming Calls',
        calls: target.incomingCalls ?? [],
        getItem: (call) => call.from,
        getRanges: (call) => call.fromRanges,
        callSiteLabel: 'calls at',
        workspacePath,
      })
    );
  }

  if (direction !== 'incoming') {
    sections.push(
      await formatCallSection({
        title: 'Outgoing Calls',
        calls: target.outgoingCalls ?? [],
        getItem: (call) => call.to,
        getRanges: (call) => call.fromRanges,
        callSiteLabel: 'called at',
        workspacePath,
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

function formatCallHierarchyItem(
  item: CallHierarchyItem,
  workspacePath?: string
): string {
  const position = getCallHierarchyItemStart(item);
  const kind = getSymbolKindName(item.kind);
  const filePath = formatFilePath(item.uri, workspacePath);
  let result = `${item.name} (${kind}) - ${filePath}:${formatZeroBasedPosition(position)}`;

  if (item.detail) {
    result += ` [${item.detail}]`;
  }

  return result;
}

async function formatCallSection<TCall extends CallSectionEntry>({
  title,
  calls,
  getItem,
  getRanges,
  callSiteLabel,
  workspacePath,
}: {
  title: string;
  calls: TCall[];
  getItem: (call: TCall) => CallHierarchyItem;
  getRanges: (call: TCall) => Range[];
  callSiteLabel: string;
  workspacePath: string | undefined;
}): Promise<string> {
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
        displayPath: formatFilePath(item.uri, workspacePath),
        calls: [call],
      });
    }
  }

  const sections: string[] = [];
  let displayedFiles = 0;
  let remainingCalls = MAX_CALLS_PER_SECTION;
  const displayedCalls: TCall[] = [];

  for (const { displayPath, calls: fileCalls } of byFile.values()) {
    if (displayedFiles >= MAX_FILES_PER_SECTION || remainingCalls === 0) {
      break;
    }

    const displayedFileCalls = fileCalls.slice(
      0,
      Math.min(MAX_CALLS_PER_FILE, remainingCalls)
    );
    displayedCalls.push(...displayedFileCalls);

    sections.push(`${displayPath} (${fileCalls.length})`);

    const previews = await getCallPreviewMap(
      displayedFileCalls,
      getItem,
      getRanges
    );

    for (const call of displayedFileCalls) {
      const item = getItem(call);
      const position = getCallHierarchyItemStart(item);
      sections.push(
        `  ${item.name} (${getSymbolKindName(item.kind)}) @${formatZeroBasedPosition(position)}`
      );

      const ranges = getRanges(call);
      if (ranges.length > 0) {
        sections.push(`    ${callSiteLabel}: ${formatCallSiteRanges(ranges)}`);
      }

      const preview = previews.get(call);
      if (preview?.text) {
        sections.push(`    \`${preview.text}\``);
      } else if (preview?.error) {
        sections.push(`    // ${preview.error}`);
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

  let header = `${title} (${calls.length} across ${byFile.size} file${byFile.size === 1 ? '' : 's'}`;
  if (displayedCalls.length < calls.length) {
    header += `, showing ${displayedCalls.length}`;
  }
  header += ')';

  const omittedCalls = calls.length - displayedCalls.length;
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
    new Set(ranges.map((range) => formatZeroBasedPosition(range.start)))
  );
  const displayedPositions = positions.slice(0, MAX_CALL_SITES_PER_ENTRY);
  let result = displayedPositions.join(', ');

  const omittedPositions = positions.length - displayedPositions.length;
  if (omittedPositions > 0) {
    result += ` (+${omittedPositions} more)`;
  }

  return result;
}

async function getCallPreviewMap<TCall extends CallSectionEntry>(
  calls: TCall[],
  getItem: (call: TCall) => CallHierarchyItem,
  getRanges: (call: TCall) => Range[]
): Promise<Map<TCall, { text?: string; error?: string }>> {
  const previewRequests: Array<{ call: TCall; uri: string; line: number }> = [];

  for (const call of calls) {
    const item = getItem(call);
    const firstRange = getRanges(call)[0];
    if (!firstRange) {
      continue;
    }

    previewRequests.push({
      call,
      uri: item.uri,
      line: firstRange.start.line,
    });
  }

  const previewMap = new Map<TCall, { text?: string; error?: string }>();
  if (previewRequests.length === 0) {
    return previewMap;
  }

  const enrichmentResults = await enrichCodeSnippets(
    previewRequests.map(({ uri, line }): EnrichmentRequest => ({
      uri,
      extent: 'line',
      line,
    }))
  );

  enrichmentResults.forEach((result, index) => {
    const previewRequest = previewRequests[index];
    if (!previewRequest) {
      return;
    }

    if (result.codeSnippet) {
      previewMap.set(previewRequest.call, {
        text: createSignaturePreview(result.codeSnippet.trim(), 100),
      });
      return;
    }

    if (result.error) {
      previewMap.set(previewRequest.call, {
        error: result.error,
      });
    }
  });

  return previewMap;
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
