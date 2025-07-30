# Cursor Context

## What

Some operations accepts as arguments:
- a file path (either relative or absolut)
- a line number (1-based)
- a character number (1-based)

The operations ask the LSP something specific about the exact symbol at that exact location provided.

It's important to be extremely precise however we have seen Claude Code passing the wrong position multiple time

For example this C# code here shows a class constructor:

```csharp
public ApplicationService(IOptions<Config> options)
```

The cursor here would point to the class 

```csharp
public Applicatio|nService(IOptions<Config> options)
```
The curor here instead would point to the IOption type which might not be what the agent was looking for

```csharp
public ApplicationService(IOpt|ions<Config> options)
```

For this reason we want tall of the operations accepting this combination of params to emit as a first output a cursor context line with the purpose of giving feedback to the agent on the selected symbol

```plaintext
{operation} on file src/test.ts:12:34
    Symbol: (Method) initialize()
    Cursor: `   lspClient.initi|alize()   `
```

Tools that need the following response sections are:
- `references`
- `rename`
- `inspect`
- `completion`

## Implementation

For this operations to have cursor context we need to
- open the file
- convert to 0 based position
- request textDocument/symbol for the selected document
- find the symbol who's range fits more closely with the cursor position
- keep track of its symbol kind (method, function, variable, field etc)
- create a snippet with 10 characters before and after the cursor position
- do the actual operation (e.g. completion, inspect, rename, references)
- close the file
- return the operation result alongside a cursor context
- At the MCP tool level use text content and use a single text content to print the cursor context block


For the algorithm to find the closest symbol to a position keep in mind that certain LSP might have symbols inside symbols:
e.g. function(x, y) -> x is a symbol with boundaries that are inside the start and end of the function symbol so it's important to order by symbol with shorter spans first