# Example of shutdown

Below is an example of how to handle shutdown scenarios when running a CLI app that runs a server while also spawning a child process

- In our case the server is not an HTTP server but rather an MCP serve and we need to inspect its source to check which options are available
- In our case the child process will be the spawning of a Language Server like `typescript-language-server --stdio`
- We should also try to send the shutdown sequence to the LSP via the request + notification (i don't remember if it's shutdown + exit or the other way around)
- If we don't manage to shut it down gracefully then we need to kill
- We might need some refactoring as for us the child process is inside a method so we need to think how to hook it to the shutdown thing and where to track the shutdown operations (should probably be done in the same way we did initialization)

```ts
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';

// --- Configuration ---
const GRACEFUL_SHUTDOWN_TIMEOUT = 5000; // 5 seconds
const PORT = 3000;
const CHILD_COMMAND = 'ping';
const CHILD_ARGS = ['google.com'];

// --- State ---
let child: ChildProcess | null = null;
let server: http.Server;
let isShuttingDown = false;

/**
 * Initiates a graceful shutdown of the server and child process.
 */
const shutdown = async (): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Create promises for each shutdown task
  const serverShutdownPromise = new Promise<void>((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  const childShutdownPromise = new Promise<void>((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      child?.kill('SIGKILL'); // Force kill after timeout
    }, GRACEFUL_SHUTDOWN_TIMEOUT);

    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    child.kill('SIGTERM'); // Request graceful shutdown
  });

  // Wait for all shutdown tasks to complete
  await Promise.allSettled([serverShutdownPromise, childShutdownPromise]);
  process.exit(0);
};

/**
 * Main application function to set up and start the services.
 */
const main = async (): Promise<void> => {
  // Set up signal handlers for graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the HTTP server
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Server is running.\n');
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  // Spawn the child process
  child = spawn(CHILD_COMMAND, CHILD_ARGS);

  // Handle unexpected child exit
  child.on('exit', () => {
    if (!isShuttingDown) {
      // If the child dies unexpectedly, shut down the whole application
      shutdown();
    }
  });
};

// --- Run Application ---
main().catch(() => {
  process.exit(1);
});
```

---

## Implementation roadmap for `lsp-use` (TypeScript/MCP)

The sample above is generic. Below are **actionable, idiomatic TypeScript steps** that fit the existing source structure.

### 1. Surface the LSP `ChildProcess`

`createLspClient()` currently resolves to `{ success, data: client }`. Extend the success payload so callers also receive the underlying `ChildProcess` – required for signalling and force-kill.

```ts
export interface LspClientResult {
  client: JsonRpcClient;
  process: ChildProcessWithoutNullStreams;
}
```

Update `main()` to keep both references.

### 2. Central shutdown coordinator

Add `src/main/shutdown.ts`:

```ts
import { once } from 'node:events';

export function setupShutdown(
  server: McpServer,
  lspClient: LspClient,
  lspProcess: ChildProcess,
  timeoutMs = 5_000
) {
  let shuttingDown = false;

  const handler = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      // 1. LSP graceful exit
      await lspClient.request('shutdown');
      lspClient.notify('exit');

      // Race: natural process exit vs. timeout → SIGKILL
      const timer = setTimeout(() => lspProcess.kill('SIGKILL'), timeoutMs);
      await once(lspProcess, 'exit');
      clearTimeout(timer);

      // 2. MCP server
      await server.disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);

  return () => {
    // disposer for tests
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
  };
}
```

### 3. Expose an MCP endpoint (IGNORE)

Create a minimal tool under `src/tools/shutdown.ts` that simply calls the same `handler`. Register it in `registerAllTools()` so remote clients may issue `server.shutdown`.

### 4. Idiomatic TS tips

- Prefer `ChildProcessWithoutNullStreams` over the broad `ChildProcess` when you use stdio; it provides typed `stdout`/`stdin` streams.
- Use numeric separators for readability: `10_000` instead of `10000`.
- Centralise magic numbers with a `const DEFAULT_TIMEOUT_MS = 5_000`.
- Return disposers from helper functions to make unit-testing and re-use easier.
- Await promises instead of manual event handlers where possible (`await once(emitter, 'exit')`).
- Leverage literal string types for event names when wrapping emitters.

### 5. Testing strategy

1. **Unit tests** (Vitest) – mock an EventEmitter as `ChildProcess`, ensure that the shutdown function sends `kill` after timeout.
2. **Integration test** – spawn `node dist/main/index.js`, send SIGINT, expect exit code 0 within 6 s.

---

Following this roadmap will make the CLI terminate predictably, release resources promptly and stay fully type-safe.

## Review (post-implementation)

Below is a short code-review of the first implementation that landed in `main/`.

### ☑️ What went well

- `setupShutdown()` mirrors the design in this document almost 1-to-1 (numeric separators, `once()`, disposer, etc.).
- `createLspClient()` now returns the underlying `ChildProcess`, which unblocks proper signalling/killing.
- An idempotent guard (`shuttingDown`) prevents double execution when multiple signals arrive.
- `main()` wires the shutdown handler early, **after** the LSP is ready but **before** the MCP transport starts – ensuring we never accept requests we can’t serve.

### 🔍 Possible refinements

1. **Soft terminate the child process as a backup** – after sending the protocol‐level `shutdown` / `exit`, also issue `lspProcess.kill('SIGTERM')`. Some language servers ignore the JSON-RPC request but honour signals.
2. **React if the LSP dies first** – add `lspProcess.once('exit', …)` that triggers the same shutdown path when the process exits unexpectedly.
3. **Dispose of the JSON-RPC connection** – `await lspClient.connection.dispose()` frees event-loop handles that could otherwise keep Node alive in edge cases.
4. **Exit code on failure** – the catch branch inside the handler currently ends with `process.exit(0)`. Using a non-zero code (e.g. `1`) lets supervisors distinguish a graceful vs. failed shutdown.
5. **Testing** –
   • Unit: fake `ChildProcess` + fake timers to assert the SIGKILL fallback.
   • Integration: spawn `node dist/main/index.js`, send SIGINT, expect exit within ≈6 s.

### ✨ Minor style nits

- The standalone `type ShutdownHandler = () => Promise<void>` is no longer needed; the inline arrow function is self-documenting.
- Use `import type { LspClient }` to avoid emitting value-side code.

---

The current implementation is already production-worthy; the points above are optional polish items you may tackle incrementally.
