export function textToolResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}
