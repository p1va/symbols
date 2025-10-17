# Language Identifier Mapping for LSP

This table maps human-readable language names to their Language Server Protocol (LSP) identifiers and associated file extensions.

| Language | LSP Identifier | Common File Extensions | Notes |
|----------|---------------|----------------------|-------|
| ABAP | `abap` | `.abap`, `.ABAP` | SAP programming language |
| Windows Bat | `bat` | `.bat`, `.cmd` | Windows batch files |
| BibTeX | `bibtex` | `.bib` | Bibliography format for LaTeX |
| Clojure | `clojure` | `.clj`, `.cljs`, `.cljc`, `.edn` | Lisp dialect for JVM |
| Coffeescript | `coffeescript` | `.coffee`, `.litcoffee` | Compiles to JavaScript |
| C | `c` | `.c`, `.h` | |
| C++ | `cpp` | `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`, `.h`, `.hpp` | |
| C# | `csharp` | `.cs` | |
| CSS | `css` | `.css` | |
| Diff | `diff` | `.diff`, `.patch` | Patch files |
| Dart | `dart` | `.dart` | Google's app development language |
| Dockerfile | `dockerfile` | `Dockerfile`, `.dockerfile`, `Containerfile` | Container definitions |
| Elixir | `elixir` | `.ex`, `.exs` | Erlang VM functional language |
| Erlang | `erlang` | `.erl`, `.hrl` | |
| F# | `fsharp` | `.fs`, `.fsi`, `.fsx`, `.fsscript` | Functional-first .NET language |
| Git | `git-commit`, `git-rebase` | `COMMIT_EDITMSG`, `git-rebase-todo` | Git operation files |
| Go | `go` | `.go` | |
| Groovy | `groovy` | `.groovy`, `.gvy`, `.gy`, `.gsh` | JVM scripting language |
| Handlebars | `handlebars` | `.hbs`, `.handlebars` | Template engine |
| HTML | `html` | `.html`, `.htm` | |
| Ini | `ini` | `.ini`, `.cfg`, `.conf` | Configuration files |
| Java | `java` | `.java` | |
| JavaScript | `javascript` | `.js`, `.mjs`, `.cjs` | |
| JavaScript React | `javascriptreact` | `.jsx` | React JSX files |
| JSON | `json` | `.json`, `.jsonc` | `.jsonc` supports comments |
| LaTeX | `latex` | `.tex`, `.ltx`, `.latex` | Document preparation system |
| Less | `less` | `.less` | CSS preprocessor |
| Lua | `lua` | `.lua` | Scripting language |
| Makefile | `makefile` | `Makefile`, `makefile`, `.mk`, `GNUmakefile` | Build automation |
| Markdown | `markdown` | `.md`, `.markdown`, `.mdown`, `.mkd` | |
| Objective-C | `objective-c` | `.m`, `.h` | |
| Objective-C++ | `objective-cpp` | `.mm` | |
| Perl | `perl` | `.pl`, `.pm`, `.pod` | |
| Perl 6 | `perl6` | `.p6`, `.pl6`, `.pm6`, `.raku`, `.rakumod` | Now called Raku |
| PHP | `php` | `.php`, `.phtml`, `.php3`, `.php4`, `.php5`, `.phps` | |
| Powershell | `powershell` | `.ps1`, `.psm1`, `.psd1` | Windows scripting |
| Pug | `jade` | `.pug`, `.jade` | Template engine (formerly Jade) |
| Python | `python` | `.py`, `.pyw`, `.pyi` | `.pyi` for type stubs |
| R | `r` | `.r`, `.R`, `.rmd`, `.Rmd` | Statistical computing |
| Razor (cshtml) | `razor` | `.cshtml`, `.razor` | ASP.NET template engine |
| Ruby | `ruby` | `.rb`, `.rbw`, `.rake`, `.gemspec` | |
| Rust | `rust` | `.rs` | |
| SCSS | `scss`, `sass` | `.scss`, `.sass` | `scss` uses curly brackets, `sass` uses indentation |
| Scala | `scala` | `.scala`, `.sc` | JVM functional/OOP language |
| ShaderLab | `shaderlab` | `.shader`, `.cginc` | Unity shader language; **⚠️ verify extensions** |
| Shell Script (Bash) | `shellscript` | `.sh`, `.bash`, `.zsh`, `.fish` | Unix shell scripts |
| SQL | `sql` | `.sql` | |
| Swift | `swift` | `.swift` | Apple's programming language |
| TypeScript | `typescript` | `.ts`, `.mts`, `.cts` | |
| TypeScript React | `typescriptreact` | `.tsx` | React TSX files |
| TeX | `tex` | `.tex` | Typesetting system |
| Visual Basic | `vb` | `.vb`, `.vbs` | **⚠️ verify `.vbs` support** |
| XML | `xml` | `.xml`, `.xsd`, `.xsl`, `.xslt`, `.svg` | |
| XSL | `xsl` | `.xsl`, `.xslt` | XML transformation |
| YAML | `yaml` | `.yaml`, `.yml` | |

## Notes

### Extensions Requiring Verification

The following language identifiers need verification for their file extension mappings:

1. **ShaderLab** (`shaderlab`) - Extensions `.shader` and `.cginc` are used in Unity, but LSP support may vary
2. **Visual Basic** (`vb`) - Unclear if `.vbs` (VBScript) is supported alongside `.vb`

### Special Cases

- **Git** identifiers (`git-commit`, `git-rebase`) refer to specific Git operation files rather than traditional source files
- **Diff** files (`.diff`, `.patch`) are typically viewed but not edited with LSP features
- **SCSS/Sass** has two identifiers (`scss` and `sass`) for different syntaxes of the same preprocessor
- **Perl 6** has been renamed to **Raku** and uses both old and new file extensions

### Implementation Guidance

**Default Extensions**: The symbols tool includes built-in default mappings for all common file extensions listed in this table. These defaults are automatically merged with any extensions you specify in your configuration.

**Key Points:**
- You typically don't need to specify `extensions` in your configuration - defaults cover most cases
- When you do specify `extensions`, they are **merged with** (not replacing) the defaults
- Your custom extensions override defaults when there's a conflict
- This means you only need to specify extensions that are custom or override defaults

**Using Default Extensions** - Most configs don't need to specify extensions:

```yaml
language-servers:
  typescript:
    command: typescript-language-server --stdio
    workspace_files:
      - package.json
      - tsconfig.json
    # No extensions needed! Defaults include:
    # .js, .mjs, .cjs → javascript
    # .jsx → javascriptreact
    # .ts, .mts, .cts → typescript
    # .tsx → typescriptreact
    # .json → json

  python:
    command: pyright-langserver --stdio
    workspace_files:
      - pyproject.toml
    # No extensions needed! Defaults include:
    # .py → python
    # .pyw → python
    # .pyi → python
```

**Adding Custom Extensions** - Only specify extensions when you need custom mappings or overrides:

```yaml
language-servers:
  typescript:
    command: typescript-language-server --stdio
    workspace_files:
      - package.json
    extensions:
      # Add custom extension for your project
      '.config.ts': 'typescript'
      '.spec.ts': 'typescript'
      # All other defaults (.ts, .js, .jsx, .tsx, .json, etc.) are automatically included!

  csharp:
    command: csharp-ls
    workspace_files:
      - '*.csproj'
    extensions:
      # Add Razor support (C# default .cs is already included)
      '.razor': 'razor'
      '.cshtml': 'razor'

  custom-lsp:
    command: my-custom-lsp
    extensions:
      # Override default JavaScript mapping for custom LSP
      '.js': 'my-custom-javascript'
      # All other defaults still apply
```

## References

- Based on [LSP Language Identifiers Specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocumentItem)
- File extensions compiled from common usage patterns and LSP server implementations
