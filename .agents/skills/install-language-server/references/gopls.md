## Gopls

### Supported Extensions

`.go`

### Install

```sh
go install golang.org/x/tools/gopls@latest
```

### Verify

```sh
gopls version
```

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
  go:
    command: gopls
    extensions:
      '.go': 'go'
    workspace_files:
      - 'go.mod'
      - 'go.work'
    diagnostics:
      strategy: 'push'
      wait_timeout_ms: 2000
    environment:
      GOPATH: '$HOME/go'
      GOCACHE: '$HOME/.cache/go-build'
      GOMODCACHE: '$HOME/go/pkg/mod'
```

### Validation Notes

- Prefer a `.go` file inside a module or workspace.
- `go.mod` or `go.work` should exist so routing happens naturally.

### Troubleshooting

- If `gopls` starts but module resolution looks wrong, verify `GOPATH`, `GOCACHE`, and `GOMODCACHE`.
- If the binary is installed but not found, make sure `$HOME/go/bin` is in `PATH`.

### More Information

- https://pkg.go.dev/golang.org/x/tools/gopls
- https://github.com/golang/tools/tree/master/gopls
