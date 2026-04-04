## Rust

Rust usually needs a real local binary instead of an `npx` wrapper.

### Install and verify

```sh
rustup component add rust-analyzer
rust-analyzer --version
```

### Recommended profile

```yaml
rust:
  command: rust-analyzer
  extensions:
    '.rs': 'rust'
  workspace_files:
    - 'Cargo.toml'
    - 'Cargo.lock'
  diagnostics:
    strategy: 'pull'
```

### Notes

- A simple validation path is `outline` or `inspect` on a `.rs` file.
- If the repo uses Cargo, `Cargo.toml` should be enough for routing in most cases.
