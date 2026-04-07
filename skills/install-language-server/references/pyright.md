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

If you use the default `npx` profile, verify package resolution like this:

```sh
npx -y -p pyright pyright --version
```

If you installed Pyright globally, verify that binary instead:

```sh
pyright --version
```

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
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

### Validation Notes

- Prefer a real project file rather than an isolated scratch file.
- Look for plausible import and type results rather than every import failing.

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
