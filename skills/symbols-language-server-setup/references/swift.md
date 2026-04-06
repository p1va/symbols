## Swift

### Supported Extensions

`.swift`

### Install

SourceKit-LSP is included with the Swift toolchain.

```sh
# macOS
brew install swift
```

On Linux, install Swift from the upstream downloads page and ensure `sourcekit-lsp` is on `PATH`.

### Verify

```sh
sourcekit-lsp --help
```

### Recommended Profile

```yaml
swift:
  command: sourcekit-lsp
  extensions:
    '.swift': 'swift'
  workspace_files:
    - 'Package.swift'
    - '*.xcodeproj'
    - '*.xcworkspace'
  diagnostics:
    strategy: 'push'
    wait_timeout_ms: 2000
```

### Validate

- Run `outline`, `inspect`, or `diagnostics` on a `.swift` file.
- For SwiftPM projects, `Package.swift` is the best routing marker.

### Troubleshooting

- If `sourcekit-lsp` is missing, fix the Swift toolchain install or `PATH` first.
- Xcode-backed workspaces may initialize more slowly than small SwiftPM repos.

### More Information

- https://github.com/apple/sourcekit-lsp
- https://www.swift.org/
