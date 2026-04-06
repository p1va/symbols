## Lua

### Supported Extensions

`.lua`

### Install

```sh
# macOS
brew install lua-language-server

# Ubuntu/Debian (snap)
sudo snap install lua-language-server --classic

# Arch Linux
sudo pacman -S lua-language-server

# Fedora
sudo dnf install lua-language-server
```

### Verify

```sh
lua-language-server --version
```

### Recommended Profile

```yaml
lua:
  command: lua-language-server
  extensions:
    '.lua': 'lua'
  workspace_files:
    - '.luarc.json'
    - '.luarc.jsonc'
    - 'init.lua'
    - 'stylua.toml'
  diagnostics:
    strategy: 'push'
    wait_timeout_ms: 2000
```

### Validate

- Run `outline`, `inspect`, or `diagnostics` on a `.lua` file.
- If the repo is a Neovim plugin or config, `init.lua` is often the best routing marker.

### Troubleshooting

- If the server starts but sees the wrong runtime or globals, add the relevant LuaLS project config rather than broadening the command blindly.

### More Information

- https://github.com/LuaLS/lua-language-server
- https://luals.github.io/
