# TypeScript Type Safety Guidelines

## Critical Type Safety Rules

**STRICT ENFORCEMENT**: The build will fail if any of these violations are present. We use ESLint before TypeScript compilation to catch type safety issues early.

### 1. **NEVER Use Explicit `any` Types**

```typescript
// ❌ FORBIDDEN - Explicit any types
function process(data: any): any {
  return data.someProperty;
}

// ✅ REQUIRED - Proper typing
function process<T>(data: T): string {
  return (data as { someProperty: string }).someProperty;
}

// ✅ BETTER - Use proper interfaces
interface DataWithProperty {
  someProperty: string;
}
function process(data: DataWithProperty): string {
  return data.someProperty;
}
```

### 2. **Handle Unknown Types Properly**

```typescript
// ❌ FORBIDDEN - any casting
const result = (response as any).data;

// ✅ REQUIRED - Type guards and proper checking
function isResponseWithData(obj: unknown): obj is { data: unknown } {
  return typeof obj === 'object' && obj !== null && 'data' in obj;
}

if (isResponseWithData(response)) {
  const result = response.data;
}

// ✅ ALTERNATIVE - Use proper typing from libraries
import { LSPResponse } from 'vscode-languageserver-protocol';
const result: LSPResponse = response;
```

### 3. **Proper Promise Handling**

```typescript
// ❌ FORBIDDEN - Floating promises
client.sendRequest('textDocument/definition', params);

// ✅ REQUIRED - Always handle promises
await client.sendRequest('textDocument/definition', params);

// ✅ ALTERNATIVE - Explicit void for fire-and-forget
void client.sendRequest('textDocument/definition', params);

// ✅ PROPER - With error handling
try {
  const result = await client.sendRequest('textDocument/definition', params);
  return result;
} catch (error) {
  console.error('LSP request failed:', error);
  throw error;
}
```

### 4. **Function Type Definitions**

```typescript
// ❌ FORBIDDEN - Generic Function type
const handler: Function = (data) => { ... };

// ✅ REQUIRED - Specific function signatures
type EventHandler = (data: EventData) => Promise<void>;
const handler: EventHandler = async (data) => { ... };

// ✅ ALTERNATIVE - Inline function types
const handler: (data: EventData) => Promise<void> = async (data) => { ... };
```

### 5. **Method Binding and `this` Context**

```typescript
// ❌ FORBIDDEN - Unbound method references
process.on('exit', client.dispose);

// ✅ REQUIRED - Proper binding
process.on('exit', () => client.dispose());

// ✅ ALTERNATIVE - Explicit void annotation for methods without this
class Client {
  dispose(this: void): void { ... }
}
process.on('exit', client.dispose); // Now safe
```

### 6. **Unused Variables and Parameters**

```typescript
// ❌ FORBIDDEN - Unused parameters
function handler(method: string, params: any) {
  console.log('handling request');
}

// ✅ REQUIRED - Use underscore prefix for intentionally unused
function handler(_method: string, _params: RequestParams) {
  console.log('handling request');
}

// ✅ BETTER - Remove unused parameters entirely
function handler() {
  console.log('handling request');
}
```

### 7. **LSP Protocol Type Usage**

```typescript
// ❌ FORBIDDEN - Manual type definitions for LSP
interface Position {
  line: number;
  character: number;
}

// ✅ REQUIRED - Use official LSP types
import { Position, Location, Range } from 'vscode-languageserver-protocol';

function getDefinition(position: Position): Promise<Location[]> {
  // Implementation
}
```

### 8. **Generic Constraints and Type Safety**

```typescript
// ❌ FORBIDDEN - Unconstrained generics that lead to any
function processLspResponse<T>(response: T): T {
  return (response as any).result;
}

// ✅ REQUIRED - Proper generic constraints
interface LspResponse<T> {
  id: number;
  result: T;
}

function processLspResponse<T>(response: LspResponse<T>): T {
  return response.result;
}
```

## Development Workflow

### Before Implementing

1. **Use existing MCP TypeScript tools** to understand type structures:

   ```typescript
   // Explore LSP protocol types
   mcp__typescript__get_symbols("node_modules/vscode-languageserver-protocol/lib/common/protocol.d.ts")

   // Understand function signatures
   mcp__typescript__inspect(file: "src/file.ts", line: X, character: Y)
   ```

2. **Check imports and exports** before using external libraries
3. **Define interfaces first** before implementing functions

### During Implementation

1. **Never use `any`** - always find the proper type
2. **Use type assertions sparingly** and with type guards
3. **Handle all promise chains** with await or explicit void
4. **Remove unused variables** or prefix with underscore

### Before Committing

1. **Run `pnpm build`** - must pass without errors
2. **Check that all LSP protocol interactions are properly typed**
3. **Verify no floating promises or unsafe operations**

## Build Commands Reference

- `pnpm lint` - Show violations without building
- `pnpm lint:fix` - Auto-fix simple violations
- `pnpm build` - **MUST PASS** - Lint + TypeScript compilation
- Build failure = type safety violations that must be fixed

## Type Safety Best Practices - Lessons Learned

### **Preventing Type Safety Drift**

Based on our experience fixing 291 type safety violations, here are key practices to prevent future drift:

#### 1. **Build Early and Often**

```bash
# Run before every commit - build must pass
pnpm build

# Quick type check without artifacts
npx tsc --noEmit
```

#### 2. **Progressive Type Safety**

```typescript
// ✅ GOOD - Start with proper types from the beginning
function processLspResponse(response: LspResponse): Location[] {
  return response.locations;
}

// ❌ AVOID - Don't use any as a "temporary" solution
function processLspResponse(response: any): any {
  return response.locations; // This "temporary" fix becomes permanent
}
```

#### 3. **Discriminated Unions for Complex Types**

```typescript
// ✅ RECOMMENDED - Use discriminated unions for LSP response types
type LspLocationResponse =
  | { type: 'single'; location: Location }
  | { type: 'multiple'; locations: Location[] }
  | { type: 'none'; locations: null };

function handleLocationResponse(response: LspLocationResponse) {
  switch (response.type) {
    case 'single':
      return [response.location];
    case 'multiple':
      return response.locations;
    case 'none':
      return [];
  }
}
```

#### 4. **Type Guards for Safety**

```typescript
// ✅ REQUIRED - Create type guards for uncertain data
function isLocationArray(data: unknown): data is Location[] {
  return (
    Array.isArray(data) &&
    data.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'uri' in item &&
        'range' in item
    )
  );
}

function processLocations(response: unknown): Location[] {
  if (isLocationArray(response)) {
    return response; // TypeScript knows this is Location[]
  }
  return [];
}
```

#### 5. **Test Type Safety**

```typescript
// ✅ GOOD - Create proper mock types
type MockLspClient = Pick<LspClient, 'connection' | 'isInitialized'>;

const mockClient: MockLspClient = {
  connection: {
    /* proper mock */
  },
  isInitialized: true,
};

// ❌ AVOID - Don't use any for test mocks
const mockClient = {
  connection: vi.fn() as any, // Type safety lost
  isInitialized: true,
};
```

#### 6. **Handle Optional Properties Explicitly**

```typescript
// ✅ REQUIRED - Always check optional properties
function processSymbol(symbol: { uri?: string; range?: Range }) {
  if (!symbol.uri || !symbol.range) {
    return null; // Explicit handling of missing properties
  }
  return { uri: symbol.uri, range: symbol.range }; // TypeScript knows these exist
}

// ❌ FORBIDDEN - Direct access to optional properties
function processSymbol(symbol: { uri?: string; range?: Range }) {
  return { uri: symbol.uri, range: symbol.range }; // uri and range might be undefined
}
```

#### 7. **Red Flags - Stop and Fix Immediately**

Watch for these patterns that indicate growing type safety debt:

- **Multiple `as any` in the same file** → Time to create proper types
- **ESLint disable comments growing** → Type system is fighting your design
- **"TODO: fix types" comments** → These never get fixed, address immediately
- **Build time increasing significantly** → Type checking overhead from poor types

#### 8. **Tools and Workflow**

```bash
# Set up pre-commit hooks to prevent type safety violations
echo "pnpm build" > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Use TypeScript strict mode features
# tsconfig.json should include:
"exactOptionalPropertyTypes": true,
"noUncheckedIndexedAccess": true,
"strict": true
```

#### 9. **Emergency Type Safety Restoration**

If you find type safety has drifted significantly:

1. **Isolate the scope**: `npx tsc --noEmit 2>&1 | head -20`
2. **Fix by area**: Start with core types (not tests)
3. **Use discriminated unions**: For complex response handling
4. **Create type guards**: For runtime safety
5. **Add proper tests**: With correct mock types

### **Key Insight**

Type safety violations compound exponentially. Fixing 1 violation immediately is easier than fixing 291 violations later. The build pipeline is your safety net - never allow it to fail for extended periods.
