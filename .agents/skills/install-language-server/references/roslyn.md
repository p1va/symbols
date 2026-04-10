## Roslyn

### Supported Extensions

`.cs`, `.cshtml`, `.razor`

### Install

Roslyn is the primary C# path for Symbols. The official language server is distributed over the Visual Studio IDE NuGet feed as a self-contained executable.

Use the bundled [ServerDownload.csproj](../assets/ServerDownload.csproj) helper project. Resolve its path from the skill bundle, then restore it with the platform matching your machine:

```sh
dotnet restore /absolute/path/to/ServerDownload.csproj \
  /p:Platform=your-platform-id \
  /p:RestorePackagesPath=/tmp/lsp-download \
  /p:ServerPath=$HOME/.csharp-lsp
```

### Verify

```sh
dotnet $HOME/.csharp-lsp/Microsoft.CodeAnalysis.LanguageServer.dll --version
```

### Good Config Setup

- Keep `workspace_loader: 'roslyn'`. That is what lets Symbols send the
  solution/project initialization notifications Roslyn expects.
- Prefer `*.sln` and `*.csproj` markers in `workspace_files`. Validate inside a
  real solution or project, not on an isolated `.cs` file.
- Keep the install path behind an environment variable like
  `SYMBOLS_ROSLYN_PATH` so the YAML stays portable across machines.
- Keep diagnostics on `pull` for Roslyn.

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
  roslyn:
    command: >
      dotnet $SYMBOLS_ROSLYN_PATH/Microsoft.CodeAnalysis.LanguageServer.dll
        --logLevel=Information
        --extensionLogDirectory=$SYMBOLS_ROSLYN_PATH/logs
        --stdio
    extensions:
      '.cs': 'csharp'
      '.cshtml': 'razor'
      '.razor': 'razor'
    workspace_loader: 'roslyn'
    workspace_files:
      - '*.sln'
      - '*.csproj'
    diagnostics:
      strategy: 'pull'
    environment:
      SYMBOLS_ROSLYN_PATH: '$HOME/.csharp-lsp'
```

### Validation Notes

- Validate inside a solution or project, not on a stray `.cs` file.
- For Razor repos, also verify a `.cshtml` or `.razor` file once the base C# path is healthy.

### Gotchas

- Roslyn is much happier with an actual solution or project context than with a
  standalone file.
- The official language server package comes from the Visual Studio IDE feed,
  not from the normal public dotnet tool flow.
- The server needs a working `dotnet` runtime available when launched.

### Troubleshooting

- Roslyn works best when `*.sln` or `*.csproj` markers route the workspace correctly.
- On Linux, inotify limits can block larger solutions. Increase `fs.inotify.max_user_instances` if logs point there.
- If you need the VS Code packaged Roslyn instead, use the `vscode-roslyn` example from the generated template rather than rewriting the `roslyn` profile from scratch.

### Source Of Truth

- [ServerDownload.csproj](../assets/ServerDownload.csproj)
- https://github.com/dotnet/roslyn
- https://pkgs.dev.azure.com/azure-public/vside/_packaging/vs-impl/nuget/v3/index.json
