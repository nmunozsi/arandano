import { describe, expect, it } from 'vitest';
import { BUNDLED_SKILLS } from '../registry.js';

describe('@arandano/skills (Phase 0 registry stub)', () => {
  it('exports an array (empty in Phase 0)', () => {
    expect(Array.isArray(BUNDLED_SKILLS)).toBe(true);
  });
});
