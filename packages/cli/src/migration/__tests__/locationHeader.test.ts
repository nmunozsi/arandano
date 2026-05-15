import { describe, expect, it } from 'vitest';
import { locationHeader } from '../locationHeader.js';

describe('locationHeader', () => {
  it('renders a header for a spec.md', () => {
    const out = locationHeader({
      fullPath: 'docs/initial-build/spec.md',
      siblings: [
        { name: 'spec.md', isCurrent: true, isDir: false },
        { name: 'plans/', isCurrent: false, isDir: true },
      ],
    });
    expect(out).toContain('> **Location:** `docs/initial-build/spec.md`');
    expect(out).toContain('> ├── spec.md          ← you are here');
    expect(out).toContain('> └── plans/');
  });

  it('marks only the current entry', () => {
    const out = locationHeader({
      fullPath: 'docs/x/plans/y/T1.md',
      siblings: [
        { name: 'plan.md', isCurrent: false, isDir: false },
        { name: 'T1.md', isCurrent: true, isDir: false },
        { name: 'T2.md', isCurrent: false, isDir: false },
      ],
    });
    expect(out).not.toContain('plan.md ← you are here');
    expect(out).toContain('T1.md            ← you are here');
    expect(out).not.toContain('T2.md ← you are here');
  });

  it('uses the parent folder name in the snippet', () => {
    const out = locationHeader({
      fullPath: 'docs/perf-instrumentation/spec.md',
      siblings: [{ name: 'spec.md', isCurrent: true, isDir: false }],
    });
    expect(out).toContain('> perf-instrumentation/');
  });

  it('ends with a single blank line after the closing fence', () => {
    const out = locationHeader({
      fullPath: 'docs/x/spec.md',
      siblings: [{ name: 'spec.md', isCurrent: true, isDir: false }],
    });
    expect(out.endsWith('\n')).toBe(true);
    expect(out.match(/\n/g)!.length).toBeGreaterThanOrEqual(7);
  });
});
