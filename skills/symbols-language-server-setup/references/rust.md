## Rust

### Supported Extensions

`.rs`

### Install

Rust usually needs a real local binary instead of an `npx` wrapper.

Recommended install:

```sh
rustup component add rust-analyzer
```

Alternative installs:

```sh
brew install rust-analyzer
sudo apt install rust-analyzer
```

### Verify

```sh
rust-analyzer --version
```

### Recommended Profile

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

### Validate

- Run `outline` or `inspect` on a `.rs` file.
- If the repo uses Cargo, confirm `Cargo.toml` is present so routing happens naturally.

### Troubleshooting

- If the workspace does not route naturally, add the relevant Cargo marker to `workspace_files`.
- If the binary is installed but not found, fix `PATH` before broadening the profile.

### More Information

- https://rust-analyzer.github.io/
- https://github.com/rust-lang/rust-analyzer
