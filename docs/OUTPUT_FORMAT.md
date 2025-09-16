# Output Format

## Right Format Status

- [DONE] search (with signature previews)
- [DONE] read (with four-tier preview system)
- [TODO] inspect
- [TODO] references
- [TODO] completion
- [DONE] logs
- [TODO] rename
- [TODO] diagnostics

## Context

We need to return content in a concise text format rather than JSON

This will make the response both human readable and AI friendly

Claude Code own preference is to have a concise and human readable output rather than a long JSON

MCP way to do so is to return content which has the following shape:

```
{
    content : [
        {
            type: text
            text: the actual content to display
        }
    ]
}
```

The text content of each content block is not gonna be displayed in fullness but shortened when too long while always staying accessible to Claude Code

For this reason it makes sense for us to use content blocks as a high level grouping blocks

## Tools

### Search ✅ IMPLEMENTED (with Signature Previews)

The search tool receives a query parameter and returns a list of symbols that match the query, enhanced with signature previews for better context.

**Implementation Details:**

- Uses enrichment system to add signature previews to all search results
- Returns symbols sorted by line number within each file for natural reading order
- Groups results by file with each file in its own content block
- File-first header format: `filename (X results)` for better scannability
- Compact 2-space indentation for symbol entries
- Position-first format: `@line:char SymbolKind - symbolName` for easy scanning
- Signature previews in backticks on indented new lines

**Format with Signature Previews:**

```
Found 13 matches for query "create" across 8 files

src/tools/enrichment.ts (2 results)
  @120:1 Function - createCodePreview
    `export function createCodePreview(codeSnippet: string, maxLines: number = 0): string { // Trim...`
  @149:1 Function - createSignaturePreview
    `export function createSignaturePreview(codeSnippet: string, maxChars: number = 100): string { //...`

src/types/position.ts (2 results)
  @30:1 Function - createOneBasedPosition
    `export function createOneBasedPosition( line: number, character: number ): OneBasedPosition { if...`
  @51:1 Function - createZeroBasedPosition
    `export function createZeroBasedPosition( line: number, character: number ): ZeroBasedPosition {...`
```

**Key Features:**

- **Signature context**: Distinguishes between similar function names by showing parameters and return types
- **Summary block**: Shows total matches and file count
- **File grouping**: Each file gets its own content block
- **Line-ordered**: Symbols sorted by position within each file
- **Compact layout**: 2-space indentation, signature previews on new lines
- **Scannable format**: Position first, then type, then name, then signature
- **Workspace-relative paths**: Files within workspace show relative paths
- **1-based positions**: LSP 0-based positions converted to user-friendly 1-based

**Signature Preview Benefits:**

- **Function overloads**: Clearly see different parameter combinations
- **Type information**: Understand parameter types and return types at a glance
- **Context**: Distinguish between similarly named functions
- **API exploration**: Quickly understand how to call functions without full inspection

**Path Handling:**

- Workspace files: `/home/work/space/src/index.ts` → `src/index.ts`
- External files: Keep absolute path, strip `file://` prefix
- Always convert LSP 0-based positions to 1-based for display

### Read ✅ IMPLEMENTED (Four-Tier Preview System with Leaf Symbol Detection)

The read tool provides a sophisticated three-tier preview system with intelligent filtering and hierarchical organization. Features smart leaf symbol detection to prevent code duplication in expanded mode.

**Four-Tier Preview System:**

1. **None Mode** (`previewMode: 'none'`): Symbol names with hierarchical organization only
2. **Signature Mode** (`previewMode: 'signature'`): Symbol names + condensed type signatures in backticks
3. **Expanded Mode** (`previewMode: 'expanded'`): Longer per-symbol snippets for leaf symbols only (prevents duplication)
4. **Raw File Reading**: Complete file context including imports, comments, and exact formatting

**Implementation Details:**

- **Smart filtering**: Uses configurable symbol kind filtering and ancestry-based filtering to show only architectural symbols
- **Leaf symbol detection**: Only shows code blocks for symbols with no children, eliminating duplication
- **Container vs leaf logic**: Classes and interfaces show structure only; individual methods/properties show implementations
- Groups symbols by root-level containers (functions, classes) with each in its own content block
- Uses simple indentation to show nesting hierarchy
- Position-first format: `@line:char Kind - symbolName` (container debug info configurable)
- Shows type breakdown summary for quick file understanding
- **Ancestry filtering**: Never shows symbols nested inside functions (eliminates callback noise)
- **maxDepth filtering**: Controls how deep into nested symbols to display (default: 99 with smart filtering)

**Format (without code preview):**

```
Found 52 symbols in file: node_modules/.../mcp.d.ts (max depth 99)
Symbol breakdown: 27 methods, 21 properties, 2 classes, 2 constructors

@12:1 Class - McpServer
  @16:5 Property - server [McpServer, Class]
  @21:5 Constructor - constructor [McpServer, Class]
  @27:5 Method - connect [McpServer, Class]
  @31:5 Method - close [McpServer, Class]
  @71:5 Method - tool [McpServer, Class]
  @75:5 Method - tool [McpServer, Class]

@163:1 Class - ResourceTemplate
  @166:5 Constructor - constructor [ResourceTemplate, Class]
  @181:5 Method - uriTemplate [ResourceTemplate, Class]
```

**Format (with code preview):**

````
Found 2 symbols in file: src/example.ts (max depth 99)
Symbol breakdown: 2 functions

@12:1 Function - myFunction
  ```typescript
  export function myFunction(param: string): Promise<Result> {
    const result = await processData(param);
    return { success: true, data: result };
  // ... 15 more lines
````

@25:1 Function - helperFunction

```typescript
function helperFunction(input: any[]): string[] {
  return input.map((item) => item.toString());
}
```

```

**Key Features:**
- **Summary block**: File path, symbol count, and type breakdown
- **Container grouping**: Each root-level symbol gets its own content block
- **Hierarchical display**: Indentation shows nesting with container debug info
- **Line-ordered**: Symbols sorted by position within each container
- **Consistent format**: Matches search tool format for familiarity
- **Smart filtering**: Only shows architectural symbols (classes, functions, methods, properties, etc.)
- **Ancestry filtering**: Eliminates noise by never showing function internals (callbacks, local variables)
- **Code preview**: Optional TypeScript-formatted code snippets with line counts
- **Debug information**: Shows `[Container, ContainerKind]` for understanding symbol relationships

**Intelligent Filtering System:**
- **ignoreSymbolKinds**: Filters out noise like string literals, number literals, object literals
- **stopSymbolTreeDescendOn**: Never traverses into Function contents (eliminates callback noise)
- **Result**: Clean architectural view showing only Classes, Interfaces, Functions, Methods, Properties, Constants, etc.

**Use Cases:**
- **API exploration**: Perfect for understanding node_modules libraries and their public interfaces
- **File overview**: Quick understanding of file structure without implementation details
- **Large file exploration**: Safely browse complex files with intelligent filtering
- **Code comprehension**: See function signatures and class structures with optional code previews
- **Module discovery**: Understand what classes/functions a module exports

**Parameters:**
- `file` (required): Path to the file to analyze
- `maxDepth` (optional, default: 99): Maximum nesting depth to display (usually not needed due to smart filtering)
- `codePreview` (optional, default: false): Include markdown-formatted code snippets


```
