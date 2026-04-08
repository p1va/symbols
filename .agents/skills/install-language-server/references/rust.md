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

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
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

### Validation Notes

- Prefer a `.rs` file in a Cargo workspace.
- If the repo uses Cargo, confirm `Cargo.toml` is present so routing happens naturally.

### Troubleshooting

- If the workspace does not route naturally, add the relevant Cargo marker to `workspace_files`.
- If the binary is installed but not found, fix `PATH` before broadening the profile.

### More Information

- https://rust-analyzer.github.io/
- https://github.com/rust-lang/rust-analyzer
