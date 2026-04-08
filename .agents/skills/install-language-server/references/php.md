## PHP

### Supported Extensions

`.php`, `.phtml`, `.php3`, `.php4`, `.php5`, `.phps`

### Install

```sh
npm install -g intelephense
```

Alternative install:

```sh
yarn global add intelephense
```

### Verify

```sh
intelephense --version
```

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
  php:
    command: intelephense --stdio
    extensions:
      '.php': 'php'
      '.phtml': 'php'
      '.php3': 'php'
      '.php4': 'php'
      '.php5': 'php'
      '.phps': 'php'
    workspace_files:
      - 'composer.json'
      - 'phpunit.xml'
      - 'artisan'
    diagnostics:
      strategy: 'push'
      wait_timeout_ms: 2000
```

### Validation Notes

- For framework repos, make sure the workspace markers match the actual project type.

### Troubleshooting

- If symbol resolution is weak, verify the repo dependencies are installed so Intelephense can index the project properly.

### More Information

- https://intelephense.com/
- https://www.npmjs.com/package/intelephense
