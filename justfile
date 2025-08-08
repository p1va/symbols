visual_studio_nuget  := "https://pkgs.dev.azure.com/azure-public/vside/_packaging/vs-impl/nuget/v3/index.json"

csharp_lang_server_version := "5.0.0-1.25353.13"
csharp_lang_server_platform := "linux-x64"
csharp_lang_server_path := "/tmp/lsp"

vscode_csharp_lang_server_path := "/home/your/.vscode/extensions"

default:
  @just --list --list-prefix " -- "

interactive:
  @just --choose

# Lists csharp lang server available platforms
[group('csharp-lang-server')]
csharp-list-platforms:
    @echo "win-x64\nwin-arm64\nlinux-x64\nlinux-arm64\nlinux-musl-x64\nlinux-musl-arm64\nosx-x64\nosx-arm64\nneutral"

[group('csharp-lang-server')]
[private]
cleanup-download:
  mv \
    {{csharp_lang_server_path}}/microsoft.codeanalysis.languageserver.{{csharp_lang_server_platform}}/{{csharp_lang_server_version}}/content/LanguageServer/{{csharp_lang_server_platform}}/* \
    {{csharp_lang_server_path}}
  rm -drf {{csharp_lang_server_path}}/microsoft.codeanalysis.languageserver.{{csharp_lang_server_platform}}/

# Downloads csharp lang server
[group('csharp-lang-server')]
csharp-download:
  @echo "Downloading Csharp Language Server {{csharp_lang_server_platform}} {{csharp_lang_server_version}} to {{csharp_lang_server_path}}"
  dotnet restore scripts/ServerDownload.csproj \
       --source {{visual_studio_nuget}} \
       /p:DownloadPath={{csharp_lang_server_path}} \
       /p:PackageName=Microsoft.CodeAnalysis.LanguageServer.{{csharp_lang_server_platform}} \
       /p:PackageVersion={{csharp_lang_server_version}}
       
  just \
    --set csharp_lang_server_platform {{csharp_lang_server_platform}} \
    cleanup-download


# Runs csharp lang server with stdio communication
[group('csharp-lang-server')]
@csharp-run-stdio:
    {{csharp_lang_server_path}}/Microsoft.CodeAnalysis.LanguageServer \
      --logLevel Information \
      --extensionLogDirectory logs \
      --stdio

# Runs csharp lang server with named pipes communication
[group('csharp-lang-server')]
@csharp-run-named-pipes pipe-name:
  dotnet \
    {{csharp_lang_server_path}}/Microsoft.CodeAnalysis.LanguageServer.dll \
      --logLevel=Information \
      --extensionLogDirectory logs \
      --pipe {{pipe-name}}

# Runs csharp lang server from the VS Code C# DevKit extension
[group('vscode-csharp-devkit-lang-server')]
@csharp-devkit-run-lang-server:
  {{vscode_csharp_lang_server_path}}/ms-dotnettools.csharp-2.84.19-linux-x64/.roslyn/Microsoft.CodeAnalysis.LanguageServer \
    --logLevel=Information \
    --razorSourceGenerator={{vscode_csharp_lang_server_path}}/ms-dotnettools.csharp-2.84.19-linux-x64/.razor/Microsoft.CodeAnalysis.Razor.Compiler.dll \
    --razorDesignTimePath={{vscode_csharp_lang_server_path}}/ms-dotnettools.csharp-2.84.19-linux-x64/.razor/Targets/Microsoft.NET.Sdk.Razor.DesignTime.targets \
    --starredCompletionComponentPath={{vscode_csharp_lang_server_path}}/ms-dotnettools.vscodeintellicode-csharp-2.2.3-linux-x64/components/starred-suggestions/platforms/linux-x64/node_modules/@vsintellicode/starred-suggestions-csharp.linux-x64 \
    --devKitDependencyPath={{vscode_csharp_lang_server_path}}/ms-dotnettools.csharp-2.84.19-linux-x64/.roslynDevKit/Microsoft.VisualStudio.LanguageServices.DevKit.dll \
    --extension={{vscode_csharp_lang_server_path}}/ms-dotnettools.csharp-2.84.19-linux-x64/.razorExtension/Microsoft.VisualStudioCode.RazorExtension.dll \
    --extension={{vscode_csharp_lang_server_path}}/ms-dotnettools.csharp-2.84.19-linux-x64/.xamlTools/Microsoft.VisualStudio.DesignTools.CodeAnalysis.dll \
    --extension={{vscode_csharp_lang_server_path}}/ms-dotnettools.csharp-2.84.19-linux-x64/.xamlTools/Microsoft.VisualStudio.DesignTools.CodeAnalysis.Diagnostics.dll \
    --extension={{vscode_csharp_lang_server_path}}/ms-dotnettools.csdevkit-1.30.44-linux-x64/components/VisualStudio.Conversations/node_modules/@microsoft/visualstudio.copilot.roslyn.languageserver/Microsoft.VisualStudio.Copilot.Roslyn.LanguageServer.dll \
    --extensionLogDirectory={{vscode_csharp_lang_server_path}}/logs/ \
    --stdio
#
# Setup Coding Agents Env
#

[private]
pull-repo repo dir:
  git clone --depth 1 https://github.com/{{repo}}.git .external/{{dir}}

# Fetches the LSP specs locally
[group('coding-agents-env')]
pull-lsp-docs:
  just pull-repo microsoft/language-server-protocol lsp-specs

# Fetches the Typescript MCP SDK locally
[group('coding-agents-env')]
pull-mcp-sdk:
  just pull-repo modelcontextprotocol/typescript-sdk mcp-typescript-sdk

# Fetches the lsp-use repo locally
[group('test-env')]
pull-old-impl:
  just pull-repo p1va/lsp-use-dotnet lsp-use

