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

### Recommended Profile

```yaml
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

### Validate

- Run `outline`, `inspect`, or `diagnostics` on a `.go` file.
- Confirm the workspace has `go.mod` or `go.work` so routing happens naturally.

### Troubleshooting

- If `gopls` starts but module resolution looks wrong, verify `GOPATH`, `GOCACHE`, and `GOMODCACHE`.
- If the binary is installed but not found, make sure `$HOME/go/bin` is in `PATH`.

### More Information

- https://pkg.go.dev/golang.org/x/tools/gopls
- https://github.com/golang/tools/tree/master/gopls
