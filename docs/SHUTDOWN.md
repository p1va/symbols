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