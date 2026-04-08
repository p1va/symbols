## Tool Selection

- Use `outline` first when you need coordinates for a later call.
- Use `inspect` for docs, types, signatures, and declaration context.
- Use `references` for usage discovery across the workspace.
- Use `rename` when the user wants a semantic refactor, not a text substitution.
- Use `diagnostics` when the question is about type or compile health.
- Use `completion` when the question is "what can I call here?"
- Use `search` only when the server supports it and indexing state is likely ready.

## Runtime Notes

- Tool calls can lazily start a profile.
- Resource reads are safer than text status parsing for current state.
- If output quality is weak after a config edit, call `reload` before retrying.
