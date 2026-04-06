## Ruby

### Supported Extensions

`.rb`, `.rbw`, `.rake`, `.gemspec`, `.ru`, `.erb`

### Install

Recommended install:

```sh
gem install ruby-lsp
```

Bundler-based alternative:

```ruby
gem 'ruby-lsp', group: :development
```

Then run:

```sh
bundle install
```

### Verify

```sh
ruby-lsp --version
```

### Recommended Profile

```yaml
ruby:
  command: ruby-lsp
  extensions:
    '.rb': 'ruby'
    '.rbw': 'ruby'
    '.rake': 'ruby'
    '.gemspec': 'ruby'
    '.ru': 'ruby'
    '.erb': 'erb'
  workspace_files:
    - 'Gemfile'
    - '.ruby-version'
    - 'Rakefile'
  diagnostics:
    strategy: 'push'
    wait_timeout_ms: 2000
```

### Validate

- Run `outline`, `inspect`, or `diagnostics` on a `.rb` file.
- If the repo is Bundler-managed, prefer validating inside that repo rather than against an arbitrary standalone Ruby file.

### Troubleshooting

- If the global `ruby-lsp` binary does not match the project environment, switch the command to `bundle exec ruby-lsp`.
- If `.erb` files behave poorly, validate the plain Ruby path first before widening the profile.

### More Information

- https://shopify.github.io/ruby-lsp/
- https://github.com/Shopify/ruby-lsp
