import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FileChange } from '../types/lsp.js';
import { fileUriToPath } from './utils.js';

export interface AppliedChange {
  range: FileChange['range'];
  oldText: string;
  newText: string;
  line: number;
  character: number;
}

export interface FailedChange {
  range: FileChange['range'];
  newText: string;
  line: number;
  character: number;
  error: string;
}

export interface ChangeResult {
  fileUri: string;
  success: boolean;
  appliedChanges: AppliedChange[];
  failedChanges: FailedChange[];
  error?: string;
}

interface PlannedFileChange {
  fileUri: string;
  filePath: string;
  originalContent: string;
  updatedContent: string;
  mode: number;
  appliedChanges: AppliedChange[];
}

interface WorkspaceChangePlan {
  workspacePath: string;
  files: PlannedFileChange[];
}

interface PreparedEdit {
  change: FileChange;
  startOffset: number;
  endOffset: number;
}

interface LineBounds {
  start: number;
  end: number;
}

interface StagedFile {
  file: PlannedFileChange;
  tempPath: string;
}

function isWithinWorkspace(workspacePath: string, filePath: string): boolean {
  const relativePath = path.relative(workspacePath, filePath);
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function createLineBounds(content: string): LineBounds[] {
  const lines: LineBounds[] = [];
  let start = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== '\n') {
      continue;
    }

    const end =
      index > start && content[index - 1] === '\r' ? index - 1 : index;
    lines.push({ start, end });
    start = index + 1;
  }

  lines.push({ start, end: content.length });
  return lines;
}

function positionToOffset(
  position: FileChange['range']['start'],
  lines: LineBounds[],
  fileUri: string
): number {
  if (
    !Number.isInteger(position.line) ||
    !Number.isInteger(position.character) ||
    position.line < 0 ||
    position.line >= lines.length
  ) {
    throw new Error(
      `Rename returned an out-of-bounds line for ${fileUri}: ${position.line + 1}:${position.character + 1}`
    );
  }

  const line = lines[position.line]!;
  const lineLength = line.end - line.start;
  if (position.character < 0 || position.character > lineLength) {
    throw new Error(
      `Rename returned an out-of-bounds character for ${fileUri}: ${position.line + 1}:${position.character + 1}`
    );
  }

  return line.start + position.character;
}

function prepareFileContent(
  fileUri: string,
  content: string,
  changes: FileChange[]
): Pick<PlannedFileChange, 'updatedContent' | 'appliedChanges'> {
  const lines = createLineBounds(content);
  const preparedEdits: PreparedEdit[] = changes.map((change) => {
    const startOffset = positionToOffset(change.range.start, lines, fileUri);
    const endOffset = positionToOffset(change.range.end, lines, fileUri);

    if (startOffset > endOffset) {
      throw new Error(
        `Rename returned a reversed edit range for ${fileUri}: ${change.startLine}:${change.startCharacter}-${change.endLine}:${change.endCharacter}`
      );
    }

    return { change, startOffset, endOffset };
  });

  const orderedEdits = [...preparedEdits].sort((left, right) =>
    left.startOffset === right.startOffset
      ? left.endOffset - right.endOffset
      : left.startOffset - right.startOffset
  );

  for (let index = 1; index < orderedEdits.length; index += 1) {
    const previous = orderedEdits[index - 1]!;
    const current = orderedEdits[index]!;
    if (
      current.startOffset < previous.endOffset ||
      current.startOffset === previous.startOffset
    ) {
      throw new Error(`Rename returned overlapping edits for ${fileUri}`);
    }
  }

  let updatedContent = content;
  for (const edit of [...orderedEdits].reverse()) {
    updatedContent =
      updatedContent.slice(0, edit.startOffset) +
      edit.change.newText +
      updatedContent.slice(edit.endOffset);
  }

  return {
    updatedContent,
    appliedChanges: preparedEdits.map(({ change, startOffset, endOffset }) => ({
      range: change.range,
      oldText: content.slice(startOffset, endOffset),
      newText: change.newText,
      line: change.startLine,
      character: change.startCharacter,
    })),
  };
}

async function resolveWorkspaceFile(
  fileUri: string,
  workspacePath: string
): Promise<{ filePath: string; mode: number }> {
  let filePath: string;
  try {
    const url = new URL(fileUri);
    if (url.protocol !== 'file:') {
      throw new Error(`unsupported URI scheme '${url.protocol}'`);
    }
    filePath = fileUriToPath(fileUri);
  } catch (error) {
    throw new Error(
      `Rename target must be a valid file URI: ${fileUri} (${error instanceof Error ? error.message : String(error)})`
    );
  }

  const realFilePath = await fs.realpath(filePath);
  if (!isWithinWorkspace(workspacePath, realFilePath)) {
    throw new Error(`Rename target is outside the workspace: ${fileUri}`);
  }

  const stats = await fs.stat(realFilePath);
  if (!stats.isFile()) {
    throw new Error(`Rename target is not a regular file: ${fileUri}`);
  }

  return { filePath: realFilePath, mode: stats.mode };
}

export async function prepareWorkspaceChanges(
  renameResult: Record<string, FileChange[]>,
  workspacePath: string
): Promise<WorkspaceChangePlan> {
  const realWorkspacePath = await fs.realpath(workspacePath);
  const workspaceStats = await fs.stat(realWorkspacePath);
  if (!workspaceStats.isDirectory()) {
    throw new Error(`Workspace is not a directory: ${workspacePath}`);
  }

  const files: PlannedFileChange[] = [];
  const resolvedPaths = new Set<string>();

  for (const [fileUri, changes] of Object.entries(renameResult)) {
    const { filePath, mode } = await resolveWorkspaceFile(
      fileUri,
      realWorkspacePath
    );
    if (resolvedPaths.has(filePath)) {
      throw new Error(
        `Rename returned the same file through multiple URIs: ${fileUri}`
      );
    }
    resolvedPaths.add(filePath);

    const originalContent = await fs.readFile(filePath, 'utf8');
    const preparedContent = prepareFileContent(
      fileUri,
      originalContent,
      changes
    );
    files.push({
      fileUri,
      filePath,
      originalContent,
      mode,
      ...preparedContent,
    });
  }

  return { workspacePath: realWorkspacePath, files };
}

async function stageFile(file: PlannedFileChange): Promise<StagedFile> {
  const tempPath = path.join(
    path.dirname(file.filePath),
    `.${path.basename(file.filePath)}.symbols-${process.pid}-${randomUUID()}.tmp`
  );
  const handle = await fs.open(tempPath, 'wx', file.mode);

  try {
    await handle.writeFile(file.updatedContent, 'utf8');
    await handle.sync();
    await handle.close();
    await fs.chmod(tempPath, file.mode);
    return { file, tempPath };
  } catch (error) {
    try {
      await handle.close();
    } catch {
      // The handle may already be closed if a later staging step failed.
    }
    try {
      await fs.unlink(tempPath);
    } catch {
      // Best-effort cleanup; preserve the original staging error.
    }
    throw error;
  }
}

async function removeStagedFiles(stagedFiles: StagedFile[]): Promise<void> {
  await Promise.all(
    stagedFiles.map(async ({ tempPath }) => {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Best-effort cleanup after staging or commit failure.
      }
    })
  );
}

export async function applyPreparedWorkspaceChanges(
  plan: WorkspaceChangePlan
): Promise<ChangeResult[]> {
  const filesToWrite = plan.files.filter(
    (file) => file.updatedContent !== file.originalContent
  );
  const stagedFiles: StagedFile[] = [];

  try {
    for (const file of filesToWrite) {
      stagedFiles.push(await stageFile(file));
    }

    for (const file of plan.files) {
      const currentContent = await fs.readFile(file.filePath, 'utf8');
      if (currentContent !== file.originalContent) {
        throw new Error(
          `Rename target changed after preflight; no files were replaced: ${file.fileUri}`
        );
      }
    }

    for (const stagedFile of stagedFiles) {
      await fs.rename(stagedFile.tempPath, stagedFile.file.filePath);
    }
  } catch (error) {
    await removeStagedFiles(stagedFiles);
    throw error;
  }

  return plan.files.map((file) => ({
    fileUri: file.fileUri,
    success: true,
    appliedChanges: file.appliedChanges,
    failedChanges: [],
  }));
}
