## Pyright

### Supported Extensions

`.py`, `.pyw`, `.pyi`

### Install

Prefer the shipped `npx` command first. It avoids a separate global install.

Optional global install:

```sh
npm install -g pyright
```

Alternative installs:

```sh
pip install pyright
pipx install pyright
```

### Verify

```sh
npx -y -p pyright pyright --version
```

### Recommended Profile

```yaml
pyright:
  command: npx -y -p pyright pyright-langserver --stdio
  extensions:
    '.py': 'python'
    '.pyw': 'python'
    '.pyi': 'python'
  workspace_files:
    - 'pyproject.toml'
    - 'requirements.txt'
    - 'setup.py'
    - 'Pipfile'
  diagnostics:
    strategy: 'pull'
```

### Validate

- Run `diagnostics` or `inspect` on a real `.py` file.
- Confirm import and type errors look plausible rather than every import failing.

### Troubleshooting

- If Pyright starts but only reports import errors, check the virtual environment configuration.
- A common fix in `pyproject.toml` is:

```toml
[tool.pyright]
venvPath = "."
venv = ".venv"
```

### More Information

- https://www.npmjs.com/package/pyright
- https://pypi.org/project/pyright/
- https://github.com/microsoft/pyright
