import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface CliOptions {
  repo: string;
  errors: number;
  keep: boolean;
}

interface TextContent {
  text?: string;
}

function usage(): never {
  throw new Error(
    "Usage: diagnostics-amplification.ts --repo <symbols-checkout> " +
      "[--errors <count>] [--keep]",
  );
}

function parseArgs(argv: string[]): CliOptions {
  let repo: string | undefined;
  let errors = 10_000;
  let keep = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--repo") {
      repo = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--errors") {
      errors = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--keep") {
      keep = true;
      continue;
    }

    usage();
  }

  if (
    !repo ||
    !Number.isSafeInteger(errors) ||
    errors < 1 ||
    errors > 100_000
  ) {
    usage();
  }

  return {
    repo: path.resolve(process.cwd(), repo),
    errors,
    keep,
  };
}

function targetModule(repo: string, relativePath: string): string {
  const target = path.join(repo, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`Target source file not found: ${relativePath}`);
  }
  return pathToFileURL(target).href;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const packageJson = path.join(options.repo, "package.json");
  if (!fs.existsSync(packageJson)) {
    throw new Error("--repo must point to a Symbols source checkout");
  }

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const workspace = path.join(scriptDirectory, "workspace");
  const filePath = path.join(workspace, "hostile.ts");

  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(
    filePath,
    Array.from(
      { length: options.errors },
      (_, index) => `const value_${index}: string = ${index};`,
    ).join("\n"),
    "utf8",
  );

  process.env.SYMBOLS_DIAGNOSTICS_STRATEGY = "push";
  process.env.SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT = "5000";

  const [
    { createLspManager },
    { prepareFileRequest },
    operations,
    diagnostics,
  ] = await Promise.all([
    import(targetModule(options.repo, "src/runtime/lsp-manager.ts")),
    import(targetModule(options.repo, "src/preparation.ts")),
    import(targetModule(options.repo, "src/lsp/operations/operations.ts")),
    import(targetModule(options.repo, "src/tools/diagnostics.ts")),
  ]);

  const manager = createLspManager();
  const startedAt = Date.now();

  try {
    await manager.configureForRun({
      command: "run",
      workspace,
      directCommand: {
        commandName: "typescript-language-server",
        commandArgs: ["--stdio"],
      },
    });

    const session = await manager.getSessionForFile(filePath);
    const prepared = prepareFileRequest(session, { file: filePath });
    if (!prepared.ok) {
      throw new Error(prepared.error.message);
    }

    const result = await operations.getDiagnostics(session, prepared.data);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const retained = session
      .getDiagnosticsStore()
      .getDiagnostics(pathToFileURL(filePath).href);

    let handler:
      ((request: unknown) => Promise<{ content: TextContent[] }>) | undefined;
    const server = {
      registerTool(
        _name: string,
        _options: unknown,
        callback: (request: unknown) => Promise<{ content: TextContent[] }>,
      ) {
        handler = callback;
      },
    };

    diagnostics.registerDiagnosticsTool(server as never, manager);
    if (!handler) {
      throw new Error("Diagnostics tool handler was not registered");
    }

    const toolResult = await handler({ file: filePath });
    const finalText = toolResult.content[0]?.text ?? "";

    console.log(
      JSON.stringify(
        {
          generatedErrors: options.errors,
          sourceBytes: fs.statSync(filePath).size,
          returnedDiagnostics: result.data.length,
          retainedDiagnostics: retained.length,
          maxReturnedMessageCharacters: Math.max(
            0,
            ...result.data.map(
              (item: { message: string }) => item.message.length,
            ),
          ),
          finalMcpTextCharacters: finalText.length,
          finalMcpTextLines:
            finalText.length === 0 ? 0 : finalText.split("\n").length,
          omissionMarkerPresent: /omitted|not shown|truncated/i.test(finalText),
          elapsedMs: Date.now() - startedAt,
        },
        null,
        2,
      ),
    );
  } finally {
    await manager.shutdown();
    if (!options.keep) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
