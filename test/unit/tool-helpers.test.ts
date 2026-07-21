import { describe, expect, it } from 'vitest';
import { textToolResult } from '../../src/tools/responses.js';

describe('tool helpers', () => {
  it('constructs a single-text MCP result', () => {
    expect(textToolResult('hello')).toEqual({
      content: [{ type: 'text', text: 'hello' }],
    });
  });
});
