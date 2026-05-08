import { describe, it, expect } from 'vitest';
import { SUPPORTED_STACKS, isSupportedStack } from '../stacks.js';

describe('stacks', () => {
  it('defines SUPPORTED_STACKS correctly', () => {
    expect(SUPPORTED_STACKS).toEqual(['node-ts', 'python', 'go', 'polyglot']);
  });

  it('isSupportedStack accepts known and rejects unknown', () => {
    expect(isSupportedStack('node-ts')).toBe(true);
    expect(isSupportedStack('python')).toBe(true);
    expect(isSupportedStack('rust')).toBe(false);
    expect(isSupportedStack('')).toBe(false);
  });
});
