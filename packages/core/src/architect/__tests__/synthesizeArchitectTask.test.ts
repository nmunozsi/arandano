import { describe, expect, it } from 'vitest';
import { synthesizeArchitectTask } from '../synthesizeArchitectTask.js';
import type { TaskFrontmatter } from '../../types/task.js';

const t1: TaskFrontmatter = { id: 'T1', title: 'A', role: 'coder' };
const t2: TaskFrontmatter = { id: 'T2', title: 'B', role: 'coder' };

describe('synthesizeArchitectTask', () => {
  it('returns null when config.enabled=false and no override', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: false,
      withArchitect: false,
      noArchitect: false,
      runShape: 'plan',
    });
    expect(r).toBeNull();
  });

  it('returns null on single-task runs', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1],
      planSlug: 'p',
      enabledInConfig: true,
      withArchitect: false,
      noArchitect: false,
      runShape: 'single',
    });
    expect(r).toBeNull();
  });

  it('returns null on phase runs without --with-architect', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: true,
      withArchitect: false,
      noArchitect: false,
      runShape: 'phase',
    });
    expect(r).toBeNull();
  });

  it('returns a task on phase runs WITH --with-architect', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: false,
      withArchitect: true,
      noArchitect: false,
      runShape: 'phase',
    });
    expect(r?.id).toBe('T-architect');
  });

  it('returns null when --no-architect overrides config', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: true,
      withArchitect: false,
      noArchitect: true,
      runShape: 'plan',
    });
    expect(r).toBeNull();
  });

  it('throws when both --with-architect and --no-architect are set', () => {
    expect(() =>
      synthesizeArchitectTask({
        tasks: [t1, t2],
        planSlug: 'p',
        enabledInConfig: true,
        withArchitect: true,
        noArchitect: true,
        runShape: 'plan',
      }),
    ).toThrow(/mutually exclusive/);
  });

  it('returns a task on plan runs with --with-architect even when disabled in config', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: false,
      withArchitect: true,
      noArchitect: false,
      runShape: 'plan',
    });
    expect(r?.id).toBe('T-architect');
  });

  it('depends on every other task in the plan', () => {
    const r = synthesizeArchitectTask({
      tasks: [t1, t2],
      planSlug: 'p',
      enabledInConfig: true,
      withArchitect: false,
      noArchitect: false,
      runShape: 'plan',
    });
    expect(r?.depends_on).toEqual(['T1', 'T2']);
    expect(r?.role).toBe('architect');
    expect(r?.title).toContain('architecture.md');
  });
});
