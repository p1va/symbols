## Eclipse JDT Language Server

### Supported Extensions

`.java`

### Install

Use one of the supported install paths:

```sh
# macOS
brew install jdtls

# Arch Linux (AUR)
yay -S jdtls
```

For other platforms, follow the upstream installation instructions and keep track of the extracted `jdtls` path.

### Verify

```sh
jdtls --help
```

If using a manual install, verify the full path instead:

```sh
$HOME/.java-lsp/jdtls/bin/jdtls --help
```

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

### Troubleshooting

- JDTLS needs a JDK, not just a JRE. Java 17 or later is the safe baseline.
- If startup is slow or flaky, verify the cache directories and the `SYMBOLS_JDTLS_PATH` value.

### More Information

- https://github.com/eclipse-jdtls/eclipse.jdt.ls
- https://github.com/redhat-developer/vscode-java
