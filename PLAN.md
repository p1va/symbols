## Client Sent Notifications

`textDocument/didOpen`

`textDocument/didClose`

`initialized`

`solution/open`

```json
{
  "solution": "full/path/to/solution.sln"
}
```

`project/open`

```json
{
  "projects": [
    "full/path/to/project.csproj",
    "full/path/to/another/project.csproj"
  ]
}
```

`exit`

# Client Sent Requests

`initialize`

```csharp
new InitializeParams
{
    ProcessId = Environment.ProcessId,
    RootUri = new Uri(workspaceFullPath),
    WorkspaceFolders =
    [
        new WorkspaceFolder
        {
            Name = workspaceFullPath,
            Uri = new Uri(workspaceFullPath),
        },
    ],
    Capabilities = new ClientCapabilities
    {
        Workspace = new WorkspaceClientCapabilities
        {
            Diagnostic = null,
        },
        TextDocument = new TextDocumentClientCapabilities
        {
            PublishDiagnostics = new PublishDiagnosticsTextDocumentSetting
            {
                RelatedInformation = true,
                VersionSupport = true,
                CodeDescriptionSupport = true,
                DataSupport = true,
            },
            Diagnostic = new DiagnosticTextDocumentSetting
            {
                DynamicRegistration = true,
                RelatedDocumentSupport = true,
            },
        },
    },
}
```

`textDocument/definition`

`textDocument/typeDefinition`

`textDocument/implementation`

`textDocument/references`

`textDocument/hover`

`textDocument/completion`

`textDocument/documentSymbol`

`workspace/symbol`

`textDocument/diagnostic`

`textDocument/rename`

`shutdown`

# Server Sent Requests/Notifications

`client/registerCapability`

`textDocument/publishDiagnostics`

`window/logMessage`

`window/_roslyn_showToast`

`workspace/projectInitializationComplete`

`workspace/diagnostic/refresh`
