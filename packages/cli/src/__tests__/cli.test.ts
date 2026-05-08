import { describe, it, expect } from 'vitest';
import Version from '../commands/version.js';

describe('CLI', () => {
  it('version command should be defined', () => {
    expect(Version).toBeDefined();
  });
});
