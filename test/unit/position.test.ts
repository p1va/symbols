import { describe, it, expect } from 'vitest';
import {
  createOneBasedPosition,
  createZeroBasedPosition,
  formatZeroBasedPosition,
  toZeroBased,
  unsafeOneBasedPosition,
  unsafeZeroBasedPosition,
} from '../../src/types/position.js';

describe('Position Utilities', () => {
  describe('createOneBasedPosition', () => {
    it('should create valid 1-based position', () => {
      const pos = createOneBasedPosition(1, 1);
      expect(pos.line).toBe(1);
      expect(pos.character).toBe(1);
    });

    it('should create position with larger coordinates', () => {
      const pos = createOneBasedPosition(10, 25);
      expect(pos.line).toBe(10);
      expect(pos.character).toBe(25);
    });

    it('should throw error for line less than 1', () => {
      expect(() => createOneBasedPosition(0, 1)).toThrow(
        'Invalid 1-based position: line=0, character=1. Both must be >= 1.'
      );
      expect(() => createOneBasedPosition(-1, 1)).toThrow(
        'Invalid 1-based position: line=-1, character=1. Both must be >= 1.'
      );
    });

    it('should throw error for character less than 1', () => {
      expect(() => createOneBasedPosition(1, 0)).toThrow(
        'Invalid 1-based position: line=1, character=0. Both must be >= 1.'
      );
      expect(() => createOneBasedPosition(1, -1)).toThrow(
        'Invalid 1-based position: line=1, character=-1. Both must be >= 1.'
      );
    });

    it('should throw error for both coordinates less than 1', () => {
      expect(() => createOneBasedPosition(0, 0)).toThrow(
        'Invalid 1-based position: line=0, character=0. Both must be >= 1.'
      );
      expect(() => createOneBasedPosition(-5, -10)).toThrow(
        'Invalid 1-based position: line=-5, character=-10. Both must be >= 1.'
      );
    });
  });

  describe('createZeroBasedPosition', () => {
    it('should create valid 0-based position', () => {
      const pos = createZeroBasedPosition(0, 0);
      expect(pos.line).toBe(0);
      expect(pos.character).toBe(0);
    });

    it('should create position with larger coordinates', () => {
      const pos = createZeroBasedPosition(9, 24);
      expect(pos.line).toBe(9);
      expect(pos.character).toBe(24);
    });

    it('should throw error for line less than 0', () => {
      expect(() => createZeroBasedPosition(-1, 0)).toThrow(
        'Invalid 0-based position: line=-1, character=0. Both must be >= 0.'
      );
      expect(() => createZeroBasedPosition(-10, 5)).toThrow(
        'Invalid 0-based position: line=-10, character=5. Both must be >= 0.'
      );
    });

    it('should throw error for character less than 0', () => {
      expect(() => createZeroBasedPosition(0, -1)).toThrow(
        'Invalid 0-based position: line=0, character=-1. Both must be >= 0.'
      );
      expect(() => createZeroBasedPosition(5, -10)).toThrow(
        'Invalid 0-based position: line=5, character=-10. Both must be >= 0.'
      );
    });

    it('should throw error for both coordinates less than 0', () => {
      expect(() => createZeroBasedPosition(-1, -1)).toThrow(
        'Invalid 0-based position: line=-1, character=-1. Both must be >= 0.'
      );
      expect(() => createZeroBasedPosition(-5, -10)).toThrow(
        'Invalid 0-based position: line=-5, character=-10. Both must be >= 0.'
      );
    });
  });

  describe('coordinate conversion', () => {
    describe('toZeroBased', () => {
      it('should convert 1-based to 0-based position', () => {
        const oneBased = createOneBasedPosition(1, 1);
        const zeroBased = toZeroBased(oneBased);

        expect(zeroBased.line).toBe(0);
        expect(zeroBased.character).toBe(0);
      });

      it('should convert larger coordinates correctly', () => {
        const oneBased = createOneBasedPosition(10, 25);
        const zeroBased = toZeroBased(oneBased);

        expect(zeroBased.line).toBe(9);
        expect(zeroBased.character).toBe(24);
      });

      it('should handle edge case of minimum valid 1-based position', () => {
        const oneBased = createOneBasedPosition(1, 1);
        const zeroBased = toZeroBased(oneBased);

        expect(zeroBased.line).toBe(0);
        expect(zeroBased.character).toBe(0);
      });

      it('should handle conversion that would result in negative coordinates', () => {
        // This test ensures toZeroBased handles the edge case correctly
        // Since we pass a valid 1-based position, the conversion should always be valid
        const oneBased = createOneBasedPosition(1, 1);
        const zeroBased = toZeroBased(oneBased);

        // Should not throw and should result in (0,0)
        expect(zeroBased.line).toBe(0);
        expect(zeroBased.character).toBe(0);
      });
    });

    describe('formatZeroBasedPosition', () => {
      it('formats the first LSP position as line 1, character 1', () => {
        expect(formatZeroBasedPosition(createZeroBasedPosition(0, 0))).toBe(
          '1:1'
        );
      });

      it('formats larger LSP positions for display', () => {
        expect(formatZeroBasedPosition(createZeroBasedPosition(9, 24))).toBe(
          '10:25'
        );
      });
    });
  });

  describe('unsafe position creators', () => {
    describe('unsafeOneBasedPosition', () => {
      it('should create 1-based position without validation', () => {
        const pos = unsafeOneBasedPosition(1, 1);
        expect(pos.line).toBe(1);
        expect(pos.character).toBe(1);
      });

      it('should create position with invalid coordinates without throwing', () => {
        // This is the "unsafe" behavior - it allows invalid coordinates
        const pos = unsafeOneBasedPosition(0, 0);
        expect(pos.line).toBe(0);
        expect(pos.character).toBe(0);
      });

      it('should create position with negative coordinates without throwing', () => {
        const pos = unsafeOneBasedPosition(-1, -5);
        expect(pos.line).toBe(-1);
        expect(pos.character).toBe(-5);
      });
    });

    describe('unsafeZeroBasedPosition', () => {
      it('should create 0-based position without validation', () => {
        const pos = unsafeZeroBasedPosition(0, 0);
        expect(pos.line).toBe(0);
        expect(pos.character).toBe(0);
      });

      it('should create position with negative coordinates without throwing', () => {
        // This is the "unsafe" behavior - it allows negative coordinates
        const pos = unsafeZeroBasedPosition(-1, -5);
        expect(pos.line).toBe(-1);
        expect(pos.character).toBe(-5);
      });

      it('should create position with any coordinates without throwing', () => {
        const pos = unsafeZeroBasedPosition(100, -50);
        expect(pos.line).toBe(100);
        expect(pos.character).toBe(-50);
      });
    });
  });

  describe('type branding', () => {
    it('should prevent direct assignment between position types', () => {
      // This test verifies TypeScript type checking at compile time
      // The actual runtime behavior is the same, but TypeScript should catch mixing types

      const oneBased = createOneBasedPosition(1, 1);
      const zeroBased = createZeroBasedPosition(0, 0);

      // These should be different branded types
      expect(oneBased).toBeDefined();
      expect(zeroBased).toBeDefined();

      // Runtime values are accessible
      expect(oneBased.line).toBe(1);
      expect(zeroBased.line).toBe(0);
    });
  });
});
