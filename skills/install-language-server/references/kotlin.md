## Kotlin

### Supported Extensions

`.kt`, `.kts`

### Install

```sh
brew install JetBrains/utils/kotlin-lsp
```

If Homebrew is not an option, follow the upstream install instructions for your platform.

### Verify

```sh
kotlin-lsp --help
```

### Good Config Setup

- Prefer a JVM-oriented Gradle or Maven workspace with real build files in
  `workspace_files`.
- Keep diagnostics on `pull`. Upstream Kotlin LSP expects an editor/client that
  supports pull diagnostics.
- If Homebrew is not available, prefer the standalone release from the upstream
  releases page over ad hoc launch scripts copied from random issue threads.

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
  kotlin:
    command: kotlin-lsp --stdio
    extensions:
      '.kt': 'kotlin'
      '.kts': 'kotlin'
    workspace_files:
      - 'build.gradle.kts'
      - 'settings.gradle.kts'
      - 'build.gradle'
      - 'pom.xml'
    diagnostics:
      strategy: 'pull'
      wait_timeout_ms: 2000
```

### Validation Notes

- Prefer a `.kt` or `.kts` file inside a Gradle or Maven workspace.
- Expect slower startup on larger Gradle-backed workspaces.

### Gotchas

- Upstream describes Kotlin LSP as experimental and pre-alpha. Stability should
  not be assumed.
- The current golden path is strongest for JVM-only Kotlin Gradle projects.
- Kotlin LSP can be used with other editors, but manual configuration is
  expected and pull diagnostics support is required.
- A Java 17+ runtime is required.

### Troubleshooting

- If the server starts but routing never happens, make sure the workspace markers reflect the actual build system.
- If the binary exists but the command fails, verify the install path and `PATH`.

### Source Of Truth

- https://github.com/Kotlin/kotlin-lsp
- https://github.com/Kotlin/kotlin-lsp/releases
