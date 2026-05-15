import { describe, expect, it } from 'vitest';
import { BUNDLED_SKILLS } from '../registry.js';

describe('BUNDLED_SKILLS', () => {
  it('exports an array', () => {
    expect(Array.isArray(BUNDLED_SKILLS)).toBe(true);
  });

  it('includes gitmoji-commits', () => {
    expect(BUNDLED_SKILLS.find((s) => s.name === 'gitmoji-commits')).toBeDefined();
  });

  it('every skill has a non-empty description', () => {
    for (const s of BUNDLED_SKILLS) expect(s.description.length).toBeGreaterThan(0);
  });
});
