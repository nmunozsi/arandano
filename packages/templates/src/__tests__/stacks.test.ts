import { describe, it, expect } from 'vitest';
import { SUPPORTED_STACKS } from '../stacks.js';

describe('stacks', () => {
  it('should have supported stacks', () => {
    expect(SUPPORTED_STACKS).toContain('typescript');
    expect(SUPPORTED_STACKS).toContain('node');
  });
});
