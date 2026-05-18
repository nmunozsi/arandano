import { describe, expect, it } from 'vitest';
import { readArchitectureTemplate } from '../index.js';

describe('readArchitectureTemplate', () => {
  it('substitutes the project name', async () => {
    const out = await readArchitectureTemplate('demo');
    expect(out).toContain('# demo — Architecture');
    expect(out).toContain('## 1. Overview');
    expect(out).toContain('## 6. Open questions');
  });

  it('contains six top-level sections', async () => {
    const out = await readArchitectureTemplate('demo');
    const headings = out.match(/^## \d\. /gm) ?? [];
    expect(headings.length).toBe(6);
  });
});
