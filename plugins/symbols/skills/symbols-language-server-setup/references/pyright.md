## Pyright

Prefer the shipped `npx` command first. It avoids a separate global install.

### Recommended profile

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

### Notes

- A simple validation path is `diagnostics` or `inspect` on a `.py` file.
- If Pyright starts but only reports import errors, check the virtual environment configuration.
- A common fix in `pyproject.toml` is:

```toml
[tool.pyright]
venvPath = "."
venv = ".venv"
```

- Optional global install:
  `npm install -g pyright`
