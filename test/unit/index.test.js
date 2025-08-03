// src/index.test.ts
import { describe, it, expect } from 'vitest';
describe('CLI Greeting', () => {
    it('should return the correct greeting message', () => {
        expect('Hello, CLI!').toBe('Hello, CLI!');
    });
});
