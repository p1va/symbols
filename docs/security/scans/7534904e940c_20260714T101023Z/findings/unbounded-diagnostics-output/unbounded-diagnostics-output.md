# Executive Summary

Symbols 0.0.22 accepts, retains, copies, sorts, formats, and returns every
diagnostic published by a language server without a count or byte limit. A
hostile checkout can therefore use ordinary source code to amplify a modest
file into a much larger MCP response and consume CPU, memory, latency, and agent
context in the user's local coding session.

I reviewed and reproduced the issue at revision
`7534904e940c5585a8675624ca71eb4e247d37e8`, whose package manifest reports
version 0.0.22. I exercised an unmodified `typescript-language-server` through
Symbols' real session and public diagnostics-tool code. A 327,779-byte file
containing 10,000 independent TypeScript errors produced 10,000 retained and
returned diagnostics, a 10,000-line response containing 868,893 characters,
and an elapsed time of 10,128 ms (about 10.1 seconds). I did not measure a crash
threshold or serialize the final item through a separate MCP stdio client; the
test invoked the registered tool handler directly. No fixed revision or broader
affected-version range was available for assessment.

The realistic attacker is the author of a repository opened by a developer or
coding agent. The user or agent must invoke `diagnostics` on the crafted file,
and the effect is confined to one local Symbols process and connected agent
context. The finding is therefore **Low severity**, **P3 priority**, with
**0.92 confidence**. It does not require a malicious language-server binary,
does not cross OS-user boundaries, and does not modify source files.

# Background

Symbols is a local Model Context Protocol bridge between an MCP host and one or
more Language Server Protocol processes. For servers such as
`typescript-language-server`, diagnostics commonly arrive as asynchronous
`textDocument/publishDiagnostics` notifications. Symbols stores the latest
array for each document URI so its public `diagnostics` tool can return errors,
warnings, informational messages, and hints to an agent.

This arrangement has two relevant trust boundaries. Repository content is
untrusted because a user may open a third-party checkout, while the language
server translates that content into LSP messages. Symbols and the language
server both run as the local user, so a deliberately malicious server is not an
interesting attacker—it could exhaust the session directly. The useful path is
instead a normal server producing a large, valid response from attacker-authored
source.

The public tool is registered at `src/tools/diagnostics.ts:69-98`. Once a file
has been routed to a session and validated, the handler obtains all diagnostics
and returns one text content item:

```ts
const result = await LspOperations.getDiagnostics(session, prepared.data);
if (!result.ok) throw new Error(result.error.message);

return {
  content: [{ type: "text" as const, text: formatDiagnostics(result.data) }],
};
```

For an agent-oriented bridge, the expected invariant is that untrusted protocol
cardinality and final model-facing output are bounded. A large language-server
response should be summarized with an explicit omission marker rather than
copied into several full-size intermediate representations and returned in its
entirety.

# Vulnerability Details

## Unbounded notification ingestion

We first reach `setupNotificationHandlers` at
`src/lsp-client.ts:604-608`. The handler forwards the server-controlled URI and
complete diagnostic array without validating count, aggregate size, or message
length:

```ts
connection.onNotification(
  "textDocument/publishDiagnostics",
  (params: PublishDiagnosticsParams) => {
    diagnosticsStore.addDiagnostics(params.uri, params.diagnostics);
  },
);
```

The store at `src/state/stores.ts:54-68` replaces history for an existing URI,
which is useful, but it retains the new array without a bound. It also retains
URI keys until the whole store is cleared:

```ts
export function createDiagnosticsStore(): DiagnosticsStore {
  const diagnostics = new Map<string, Diagnostic[]>();

  return {
    diagnostics,
    addDiagnostics(uri: string, diagnostics: Diagnostic[]) {
      this.diagnostics.set(uri, diagnostics);
    },
    getDiagnostics(uri: string): Diagnostic[] {
      return this.diagnostics.get(uri) || [];
    },
    clear() {
      this.diagnostics.clear();
    },
  };
}
```

If the server publishes `N` diagnostics, the store therefore holds all `N`.
Publishing an empty array does not delete the URI key. Repeating the pattern
across distinct files can grow the map for the lifetime of the session, while a
single pathological file is enough to reach the stronger output-amplification
path.

## Full-array copying and formatting

When we carry the stored array into the push strategy,
`getPushDiagnostics` at
`src/lsp/operations/operations.ts:557-579` waits for the configured publication
window, fetches the entire
array, and maps every item into a new object:

```ts
const diagnostics = diagnosticsStore.getDiagnostics(uri);

const diagnosticEntries: DiagnosticEntry[] = diagnostics.map((diagnostic) => ({
  code: diagnostic.code?.toString() || "unknown",
  message: diagnosticMessageToString(diagnostic.message),
  severity: diagnostic.severity || 1,
  range: diagnostic.range,
  source: diagnostic.source || "unknown",
}));

return diagnosticEntries;
```

The tool then performs another full-array clone and sort at
`src/tools/diagnostics.ts:13-36`, maps every entry into a formatted string, and
joins all strings:

```ts
const sortedDiagnostics = [...diagnostics].sort((a, b) => {
  if (a.severity !== b.severity) return a.severity - b.severity;
  if (a.range.start.line !== b.range.start.line) {
    return a.range.start.line - b.range.start.line;
  }
  return a.range.start.character - b.range.start.character;
});

return sortedDiagnostics
  .map((diagnostic) => {
    const line = diagnostic.range.start.line + 1;
    const character = diagnostic.range.start.character + 1;
    return (
      `${getSeveritySymbol(diagnostic.severity)} @${line}:${character} ` +
      `[${getSeverityName(diagnostic.severity)}][${diagnostic.code}] ` +
      `${diagnostic.message} (${diagnostic.source})`
    );
  })
  .join("\n");
```

Finally, `src/tools/diagnostics.ts:92-95` places the whole joined string in one
MCP text item. There is no final character budget. For `N` diagnostics, the
path retains the protocol array, creates an `N`-element operation array, clones
it for sorting, allocates `N` formatted strings, and constructs the joined
response. Sorting also adds `O(N log N)` CPU work. The response then consumes
the connected host's transport and model-context budgets.

## Demonstrated bad state

We can trigger this path with ordinary TypeScript statements of the form:

```ts
const value_0: string = 0;
const value_1: string = 1;
// ... one independent type error per line ...
```

At 10,000 lines, the unmodified server published all 10,000 errors. Symbols
retained all 10,000, returned all 10,000 from the operation, and emitted all
10,000 as an 868,893-character text item. No omission marker indicated that the
result was unusually large because nothing had been omitted.

# Exploitability Analysis

## Strongest route: cardinality from hostile source

The most credible route is diagnostic cardinality, not oversized messages from
a custom server. A repository author can generate thousands of independent,
valid type errors in a supported source file. Once the user or agent asks for
diagnostics, an ordinary TypeScript server supplies the amplification input.
This crosses a meaningful component boundary: lower-authority workspace content
becomes memory and output work in the separate MCP process without requiring the
attacker to replace an executable.

Reliability is high at the validated scale. Each source line independently
produces an error, so we do not depend on parser recovery, deep recursion, or a
server bug. The 10,000-error case completed rather than crashing, which is
important for calibration: the demonstrated primitive is a repeatable delay and
large response, not process termination. Larger values are likely to increase
cost, but I did not determine a safe or stable crash threshold.

## Repeated formatting and URI breadth

After diagnostics have been published, repeated calls for the same file repeat
the mapping, clone, sort, string allocation, and join work even if the server
does not publish a new array. A prompt-injected repository could try to induce
an agent to retry diagnostics, multiplying local cost. That route depends on
agent behavior and is less direct than a single call, but it does not require
additional source growth.

A second route uses many supported files. The map has no URI-count limit, and
an empty publication leaves a key present. This can increase session-lifetime
memory across documents. It is a useful hardening target, although the provided
PoC focuses on one file because that path also proves the public output sink and
does not depend on long-lived multi-file scheduling.

## Constraints and non-goals

The effect is local and requires an explicit diagnostics request. A developer
can recover by stopping or restarting Symbols, and the PoC did not corrupt
files or cross into another OS user. MCP hosts may impose their own response or
context limits, but those downstream controls are not visible to Symbols and
may merely move the failure into the host.

Long diagnostic messages are another theoretical multiplier because the store
does not cap string length. I do not rely on that route for exploitability: the
ordinary-server run used messages no longer than 49 characters. Likewise, a
malicious language server is an uninteresting shortcut because it already runs
with the user's authority. The ordinary-server result is what makes this a
reportable boundary failure rather than a generic same-authority denial of
service.

# Proof of Concept

The accompanying `poc/diagnostics-amplification.ts` adapts the validation
harness into a portable probe. It accepts a relative path to a Symbols checkout,
generates a disposable TypeScript workspace, starts the normal
`typescript-language-server` through Symbols' direct-run/session code, reads
the retained push diagnostics, and invokes the registered public tool handler.
It removes the generated workspace after shutdown unless `--keep` is supplied.

Arrange the report bundle and checkout as siblings:

```text
bundle/
├── symbols/
└── unbounded-diagnostics-output/
    ├── unbounded-diagnostics-output.md
    └── poc/
```

After installing the target checkout's dependencies and making
`typescript-language-server` available on `PATH`, run a smaller case first:

```sh
cd unbounded-diagnostics-output/poc
git -C ../../symbols checkout 7534904e940c5585a8675624ca71eb4e247d37e8
../../symbols/node_modules/.bin/tsx ./diagnostics-amplification.ts \
  --repo ../../symbols --errors 1000
```

Then reproduce the validated scale:

```sh
../../symbols/node_modules/.bin/tsx ./diagnostics-amplification.ts \
  --repo ../../symbols --errors 10000
```

Representative vulnerable output is:

```text
{
  "generatedErrors": 10000,
  "sourceBytes": 327779,
  "returnedDiagnostics": 10000,
  "retainedDiagnostics": 10000,
  "maxReturnedMessageCharacters": 49,
  "finalMcpTextCharacters": 868893,
  "finalMcpTextLines": 10000,
  "omissionMarkerPresent": false,
  "elapsedMs": 10128
}
```

Timing varies by host. This is an availability test: high counts can consume
substantial CPU and memory, so use a disposable local session and begin with
1,000 errors. The script does not modify the Symbols checkout and cleans its
generated workspace automatically. Full prerequisites, expected fixed behavior,
and manual cleanup are documented in `poc/README.md`.

# Remediation

The invariant to restore is simple: untrusted diagnostics must be bounded before
retention, during transformation, and at final MCP formatting. Each truncation
must be explicit so the user knows the result is incomplete. Applying only a
transport limit is insufficient because the full array has already been stored,
copied, and sorted by that point.

A minimal defensive pattern can cap per-document count and message length at the
store, delete empty URI entries, and impose a final text budget. The exact
product limits should be tuned, but the shape can look like this:

```ts
const MAX_DIAGNOSTICS_PER_URI = 1_000;
const MAX_DIAGNOSTIC_MESSAGE_CHARS = 2_000;

addDiagnostics(uri: string, incoming: Diagnostic[]) {
  if (incoming.length === 0) {
    this.diagnostics.delete(uri);
    return;
  }

  const bounded = incoming
    .slice(0, MAX_DIAGNOSTICS_PER_URI)
    .map((item) => ({
      ...item,
      message: item.message.slice(0, MAX_DIAGNOSTIC_MESSAGE_CHARS),
    }));

  this.diagnostics.set(uri, bounded);
}
```

The store should preserve `incoming.length - bounded.length` as metadata so the
tool can render an omission marker. The formatter should independently cap
displayed entries and total characters, for both push and pull strategies:

```ts
const MAX_RENDERED_DIAGNOSTICS = 200;
const MAX_DIAGNOSTIC_OUTPUT_CHARS = 64 * 1024;

const displayed = sortedDiagnostics.slice(0, MAX_RENDERED_DIAGNOSTICS);
let text = displayed.map(formatDiagnostic).join("\n");
const omitted = diagnostics.length - displayed.length;

if (omitted > 0) {
  text += `\n... ${omitted} more diagnostics not shown`;
}

return truncateWithMarker(text, MAX_DIAGNOSTIC_OUTPUT_CHARS);
```

For broader hardening, cap or evict URI keys with an LRU policy and remove keys
when a server clears diagnostics. Avoid storing protocol arrays by reference,
and consider a shared bounded-output utility so all MCP tools apply consistent
character budgets. The existing bounded window-log store provides a useful
local design precedent.

Regression coverage should include:

- a push notification above the per-URI cap, asserting bounded retained items
  and the correct omitted count;
- oversized diagnostic messages, asserting per-message truncation;
- an empty publication, asserting that the URI key is removed;
- more document URIs than the store limit, asserting deterministic eviction;
- push and pull tool results above count and character budgets, asserting a
  stable omission marker and a bounded final text item;
- repeated calls, asserting the cap applies before clone/sort/format work; and
- an integration case using an ordinary TypeScript server and a generated
  high-error file, asserting bounded response size and acceptable latency.

# Summary

At revision `7534904e940c5585a8675624ca71eb4e247d37e8`, Symbols trusts diagnostic
cardinality across the LSP boundary and carries the complete array through
storage, mapping, sorting, string formatting, and MCP output. We demonstrated
that an ordinary TypeScript server, driven only by a hostile 327,779-byte source
file, produces 10,000 retained and returned diagnostics and an 868,893-character
response in about 10.1 seconds.

The issue is local, explicitly triggered, recoverable, and does not grant code
execution or cross-user access, which supports Low/P3 severity. Bounding
diagnostics at ingress and output, preserving omission metadata, and limiting
URI retention removes the amplification primitive while keeping the tool useful
for agents. Similar review of other LSP arrays is worthwhile, especially where
an operation both retains protocol data and expands it into model-facing text.
