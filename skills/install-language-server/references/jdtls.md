## Eclipse JDT Language Server

### Supported Extensions

`.java`

### Install

Prefer the upstream distribution path first. Download and extract a milestone
build from Eclipse JDT LS:

```sh
# Pick a directory you want to keep on this machine.
mkdir -p $HOME/.java-lsp
# Then download and extract a milestone or snapshot build into that location.
```

Keep track of the extracted JDTLS root directory and point
`SYMBOLS_JDTLS_PATH` at it.

Package-manager installs can work too, but they are secondary to the upstream
distribution:

```sh
# macOS
brew install jdtls

# Arch Linux (AUR)
yay -S jdtls
```

### Verify

```sh
jdtls --help
```

If using a manual install, verify the full path instead:

```sh
$HOME/.java-lsp/jdtls/bin/jdtls --help
```

### Good Config Setup

- JDTLS needs a full JDK, not just a JRE.
- Keep `SYMBOLS_JDTLS_PATH` pointing at the extracted JDTLS distribution root.
- Use a user-writable cache/config path for `-configuration`, and keep `-data`
  unique per workspace.
- Prefer Maven or Gradle markers in `workspace_files` so routing matches the
  actual project shape.

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
  java:
    command: >
      $SYMBOLS_JDTLS_PATH/bin/jdtls
        -configuration $HOME/.cache/jdtls/config
        -data $HOME/.cache/jdtls/workspace/$SYMBOLS_WORKSPACE_NAME
        --jvm-arg=-Dlog.protocol=true
        --jvm-arg=-Dlog.level=ALL
    extensions:
      '.java': 'java'
    workspace_files:
      - 'pom.xml'
      - 'build.gradle'
      - 'build.gradle.kts'
      - 'settings.gradle'
      - 'settings.gradle.kts'
      - 'gradlew'
      - 'mvnw'
    diagnostics:
      strategy: 'push'
      wait_timeout_ms: 2000
    environment:
      SYMBOLS_JDTLS_PATH: '$HOME/.java-lsp/jdtls'
```

### Validation Notes

- Prefer a `.java` file inside a Maven or Gradle workspace.
- Expect slower first startup than TypeScript or Pyright, especially on large Gradle or Maven projects.

### Gotchas

- Upstream requires Java 21 or later to run the language server.
- The bundled platform config inside the JDTLS distribution is not the same as
  the writable `-configuration` path you should use at runtime.
- `-data` should be stable and workspace-specific, or project state can be
  confusing across repos.

### Troubleshooting

- JDTLS needs a JDK, not just a JRE. Java 21 or later is the safe baseline.
- If startup is slow or flaky, verify the cache directories and the `SYMBOLS_JDTLS_PATH` value.

### Source Of Truth

- https://github.com/eclipse-jdtls/eclipse.jdt.ls
- https://github.com/eclipse-jdtls/eclipse.jdt.ls?tab=readme-ov-file#installation
- https://download.eclipse.org/jdtls/milestones/
- https://download.eclipse.org/jdtls/snapshots/
