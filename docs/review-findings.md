# Review Findings (2025-02)

- Command parsing breaks when an LSP executable path or argument contains spaces (`src/config/lsp-config.ts:315`). The current `split(' ')` approach corrupts commands such as `${LOCAL_NODE_MODULE}/typescript-language-server --stdio` on Windows. Replace this with proper shell-word parsing or an explicit command/args structure in config.
- File warm-up resolves paths relative to the current working directory instead of the configured workspace (`src/lsp/fileLifecycle/manager.ts:61`). When the server is started outside the project root, preload files like `./src/index.ts` never open. Paths should be resolved against the workspace directory provided via the CLI/config.
- The blanket `connection.onRequest` handler returns `null` for every unhandled request (`src/lsp-client.ts:255`). That violates the LSP contract for methods such as `workspace/configuration`; respond with a proper error or remove the catch-all handler.
- Upgrading to contextual logging copies the entire session log into memory before appending (`src/utils/logger.ts:138-149`). Large sessions could spike memory and waste I/O. Stream the content or rotate instead of rewriting.
- Diagnostic provider lookups log full provider lists at info level (`src/state/stores.ts:87`). This is noisy and slows tool responses; drop to debug or trim the payload.
- Docs improvements: spell out that commands run relative to the workspace (until the path bug is fixed) and call out the minimum Node.js version; consider clarifying why so many LSP packages ship by default and offer a quick-start smoke test.
