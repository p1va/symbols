# Read Tool - Signature Mode Example

The `read` tool with `signature` mode provides an optimal balance between overview and detail, showing function signatures and type information without overwhelming implementation details.

## Example: Reading LSP Operations File

**Command:**
```
mcp__symbols__read({ 
  file: "src/lsp/operations/operations.ts", 
  previewMode: "signature" 
})
```

**Output Sample:**
```
Found 239 symbols in file: src/lsp/operations/operations.ts (max depth 99)
Symbol breakdown: 117 propertys, 78 constants, 41 functions, 3 variables

@94:1 Function - inspectSymbol
  `export async function inspectSymbol( ctx: LspContext, request: SymbolPositionRequest ):...`

@219:1 Function - findReferences
  `export async function findReferences( ctx: LspContext, request: SymbolPositionRequest ):...`

@291:1 Function - completion
  `export async function completion( ctx: LspContext, request: SymbolPositionRequest ):...`

@392:1 Function - searchSymbols
  `export async function searchSymbols( ctx: LspContext, request: SearchRequest ): Promise<Result<Sy...`

@466:1 Function - readSymbols
  `export async function readSymbols( ctx: LspContext, request: FileRequest ): Promise<Result<Flatte...`

@510:1 Function - getDiagnostics
  `export async function getDiagnostics( ctx: LspContext, request: FileRequest ): Promise<Result<Dia...`

@688:1 Function - rename
  `export async function rename( ctx: LspContext, request: RenameRequest ): Promise<Result<Operation...`

@768:1 Function - logs
  `export function logs(ctx: LspContext): Result<LogMessageResult[]> { const { windowLogStore } =...`
```

## Key Benefits of Signature Mode

- **API Understanding**: See function signatures, parameters, and return types without implementation noise
- **Quick Assessment**: Understand what functions do and how to call them at a glance  
- **Type Information**: Get crucial TypeScript type details for proper usage
- **Hierarchical Structure**: Nested properties and constants show with their signatures
- **Perfect for Exploration**: Ideal when you need to understand "what's available" rather than "how it works"
- **Compact Overview**: 239 symbols condensed into digestible, actionable information

## Use Cases

- **API Discovery**: Understanding available functions and their interfaces
- **Integration Planning**: Seeing what parameters functions expect
- **Type Safety**: Getting accurate TypeScript signatures for proper calls
- **Code Review**: Quick overview of module structure and exported functionality
- **Documentation**: Understanding public interfaces without implementation details

This mode is particularly valuable for large files where full implementation would be overwhelming, but simple names-only would lack crucial type information needed for effective development.