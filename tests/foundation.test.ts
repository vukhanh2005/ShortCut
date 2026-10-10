import { test, expect } from 'vitest';
test('integer microseconds retain one hour precisely', () => { expect(Number.isSafeInteger(3600 * 1_000_000)).toBe(true); });
