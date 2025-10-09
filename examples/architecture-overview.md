# Symbols MCP Server – Architecture Overview

This document summarizes the overall structure of the Symbols MCP server codebase and highlights the most relevant files to review when you want to understand how the system fits together.

## Entry Point & Runtime Bootstrap
- `src/main/index.ts`
  - Parses CLI flags, resolves configuration, and detects the LSP to launch.
  - Creates logging/state stores and exposes the `createContext` helper the MCP tools consume.
  - Orchestrates LSP initialization, workspace loading, and tool registration before calling `main`.
- `src/main/shutdown.ts`
  - Installs signal handlers to terminate the child LSP process cleanly.
  - Coordinates JSON-RPC shutdown and surfaces crash information for diagnostics.

## Configuration & CLI Plumbing
- `src/utils/cli.ts`
  - Defines CLI schema, workspace/path validation, and log-level parsing.
  - Resolves combined CLI/env configuration and reports available LSPs.
- `src/config/lsp-config.ts`
  - Loads `symbols.yaml`, merges workspace overrides, and expands environment variables.
  - Exposes helpers for selecting/configuring LSPs per workspace or file extension.
- `src/utils/first-run.ts`
  - Detects first-run scenarios and scaffolds a default configuration file when needed.
- `src/utils/appPaths.ts`
  - Computes per-user config and log directories with consistent OS-specific paths.

## LSP Process & Transport
- `src/lsp-client.ts`
  - Resolves command paths, spawns the LSP child process, and attaches stdio handlers.
  - Establishes the JSON-RPC connection, registers notification/request handlers, and extracts diagnostic providers.
  - Manages contextual logging and sanitizes environment variables for the child process.
- `src/lsp/fileLifecycle/manager.ts`
  - Opens files according to lifecycle strategy (transient/persistent) for each operation.
  - Wraps LSP calls, handles preload data, and enriches results with cursor context before closing files when appropriate.

## Core LSP Operations Layer
- `src/lsp/operations/operations.ts`
  - Exposes high-level operations (`inspect`, `read`, `search`, `references`, `completion`, `rename`, `diagnostics`, `logs`).
  - Validates inputs, coordinates file lifecycle, performs LSP requests, and normalizes responses.
  - Converts workspace edits and diagnostics into internal domain types for tool consumption.
- `src/utils/cursorContext.ts`
  - Locates the symbol/semantic token at the cursor and builds code snippets for context.
  - Provides helper utilities for formatting cursor context back to the user.
- `src/validation.ts`
  - Validates workspace readiness, file paths, and cursor positions prior to LSP execution.
  - Supplies reusable result helpers for operations to short-circuit on invalid inputs.

## Tool Registration & Presentation
- `src/tools/index.ts`
  - Registers every MCP tool using the shared `createContext` factory.
- `src/tools/read.ts`
  - Formats document symbols hierarchically and enriches them with code previews.
- `src/tools/search.ts`
  - Groups search hits by file, sorts by location, and attaches signature previews when available.
- `src/tools/references.ts`
  - Aggregates references per file, adds code snippets/signatures, and outputs a navigation-ready summary.
- `src/tools/inspect.ts`
  - Combines hover, definition, type definition, and implementation data into a single report.
- `src/tools/completion.ts`
  - Sorts completions by priority, groups by kind, and renders inline documentation snippets.
- `src/tools/rename.ts`
  - Triggers rename requests, applies workspace edits locally, and summarizes successes/failures.
- `src/tools/diagnostics.ts`
  - Orders diagnostics by severity/location and decorates them with severity symbols/names.
- `src/tools/logs.ts`
  - Formats window log messages, extracting log level and contextual prefixes.
- `src/tools/enrichment.ts`
  - Shared utilities that decode file URIs, read snippets, and build signature previews for tool results.
- `src/tools/utils.ts`
  - Applies workspace edits to local files, formats rename summaries, and normalizes symbol kinds.

## Shared State & Stores
- `src/state/stores.ts`
  - Provides in-memory stores for diagnostics, window logs, and workspace loader state.
  - Handles provider registration/filtering and exposes convenience getters for tooling.
- `src/workspace/registry.ts`
  - Registers available workspace loaders and exposes helpers to query loader availability.
- `src/workspace/loaders/default.ts`
  - Minimal loader that immediately reports readiness for general workspaces.
- `src/workspace/loaders/csharp.ts`
  - Detects `.sln`/project files, initializes C#-specific workspace metadata, and reacts to server notifications.

## Types & Utilities
- `src/types.ts`
  - Defines domain interfaces (LspContext, diagnostics, errors, workspace state) and error factories.
- `src/types/lsp.ts`
  - Wraps LSP protocol structures (document symbols, semantic tokens, workspace edits) with typed helpers.
- `src/utils/logger.ts`
  - Creates session loggers, rotates contextual log files, and upgrades loggers for workspace/LSP specificity.
- `src/utils/logging.ts`
  - Shared logging utilities: filename sanitization, contextual logger creation, and legacy fallbacks.
- `src/utils/logLevel.ts`
  - Maps log levels and suggests default preload files for workspaces lacking configuration.

## Testing Surface
- `test/unit/lsp-operations.test.ts`
  - Exercises the operations layer with mocked LSP clients and validation paths.
- `test/unit/validation.test.ts`
  - Covers path/position validation and workspace readiness checks.
- `test/integration/base/LanguageTestSuite.ts`
  - Common harness that spins up sample workspaces and exercises tools end-to-end.
- `test/integration/languages/*/*.test.ts`
  - Language-specific suites (TypeScript, Go, Rust, Python, C#) validating behavior against real projects.
- `test/integration/languages/*/test-project`
  - Sample workspaces used by the integration suites to mimic real-world codebases.

Keep this document handy when navigating the repository or onboarding new contributors—it points to the files that shape the runtime, the LSP integration, and the tool-facing APIs.
