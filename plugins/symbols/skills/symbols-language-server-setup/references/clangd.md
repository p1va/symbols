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

### Recommended Profile

```yaml
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
    - './src/main.cpp'
    - './main.cpp'
    - './src/main.c'
    - './main.c'
  diagnostics:
    strategy: 'push'
    wait_timeout_ms: 2000
```

### Validate

- Run `outline`, `inspect`, or `diagnostics` on a real `.c` or `.cpp` file.
- If search matters, confirm the server owns a preload file after first use.

### Troubleshooting

- Ensure `compile_commands.json` or `compile_flags.txt` is available, or pass the correct compile-commands directory in the command.
- If search looks empty, keep a representative source file open through `preload_files`.

### More Information

- https://clangd.llvm.org/
- https://clangd.llvm.org/installation
