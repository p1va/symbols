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

### Recommended Profile

```yaml
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
    strategy: 'push'
    wait_timeout_ms: 2000
```

### Validate

- Run `outline`, `inspect`, or `diagnostics` on a `.kt` or `.kts` file.
- Expect slower startup on larger Gradle-backed workspaces.

### Troubleshooting

- If the server starts but routing never happens, make sure the workspace markers reflect the actual build system.
- If the binary exists but the command fails, verify the install path and `PATH`.

### More Information

- https://github.com/Kotlin/kotlin-lsp
