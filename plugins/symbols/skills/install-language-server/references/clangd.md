## Clangd

### Supported Extensions

`.c`, `.h`, `.cpp`, `.cc`, `.C`, `.cxx`, `.hpp`, `.H`, `.hh`, `.hxx`

### Install

```sh
# macOS
brew install llvm

# Ubuntu/Debian
sudo apt install clangd

# Fedora
sudo dnf install clang-tools-extra

# Arch Linux
sudo pacman -S clang
```

### Verify

```sh
clangd --help
```

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
  clangd:
    command: clangd --background-index
    extensions:
      '.c': 'c'
      '.h': 'c'
      '.cpp': 'cpp'
      '.cc': 'cpp'
      '.C': 'cpp'
      '.cxx': 'cpp'
      '.hpp': 'cpp'
      '.H': 'cpp'
      '.hh': 'cpp'
      '.hxx': 'cpp'
    workspace_files:
      - 'compile_commands.json'
      - 'compile_flags.txt'
      - 'Makefile'
      - 'CMakeLists.txt'
    preload_files:
      - './src/main.{cpp,c}'
      - './main.{cpp,c}'
    diagnostics:
      strategy: 'push'
      wait_timeout_ms: 2000
```

### Validation Notes

- Prefer a real `.c` or `.cpp` file with `compile_commands.json` or `compile_flags.txt` available.
- If search matters, confirm the server owns at least one preload file after first use.
- Prefer bounded glob patterns for `preload_files` so the same profile works across repositories without opening every source file.

### Troubleshooting

- Ensure `compile_commands.json` or `compile_flags.txt` is available, or pass the correct compile-commands directory in the command.
- If search looks empty, keep a representative source file open through `preload_files`.

### More Information

- https://clangd.llvm.org/
- https://clangd.llvm.org/installation
