import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlan } from '../loadPlan.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-plan-'));
  return async () => rm(dir, { recursive: true, force: true });
});

describe('loadPlan', () => {
  it('loads all task MDs in a plan dir', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'p');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'T1-foo.md'), '---\nid: T1\ntitle: foo\nrole: coder\n---\n');
    await writeFile(
      join(planDir, 'T2-bar.md'),
      '---\nid: T2\ntitle: bar\nrole: coder\ndepends_on: [T1]\n---\n',
    );
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'p' });
    expect(tasks.map((t) => t.frontmatter.id).sort()).toEqual(['T1', 'T2']);
    expect(tasks.find((t) => t.frontmatter.id === 'T2')?.frontmatter.depends_on).toEqual(['T1']);
  });

  it('ignores non-task files', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'p');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'T1-foo.md'), '---\nid: T1\ntitle: foo\nrole: coder\n---\n');
    await writeFile(join(planDir, 'README.md'), '# not a task');
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'p' });
    expect(tasks.map((t) => t.frontmatter.id)).toEqual(['T1']);
  });
});

describe('loadPlan — new structure', () => {
  it('loads tasks from .arandano/specs/<spec>/plans/<plan>/ (single-phase collapsed)', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'helpers', 'plans', 'three-helpers');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'plan.md'), '# plan\n');
    await writeFile(join(planDir, 'T1-foo.md'), '---\nid: T1\ntitle: foo\nrole: coder\n---\n');
    await writeFile(join(planDir, 'T2-bar.md'), '---\nid: T2\ntitle: bar\nrole: coder\n---\n');
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'three-helpers' });
    expect(tasks.map((t) => t.frontmatter.id).sort()).toEqual(['T1', 'T2']);
  });

  it('loads tasks from phase-*/ subfolders (multi-phase plan)', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'helpers', 'plans', 'multi');
    await mkdir(join(planDir, 'phase-1-a'), { recursive: true });
    await mkdir(join(planDir, 'phase-2-b'), { recursive: true });
    await writeFile(join(planDir, 'plan.md'), '# plan\n');
    await writeFile(join(planDir, 'phase-1-a', 'phase.md'), '# phase\n');
    await writeFile(
      join(planDir, 'phase-1-a', 'T1-foo.md'),
      '---\nid: T1\ntitle: foo\nrole: coder\n---\n',
    );
    await writeFile(join(planDir, 'phase-2-b', 'phase.md'), '# phase\n');
    await writeFile(
      join(planDir, 'phase-2-b', 'T2-bar.md'),
      '---\nid: T2\ntitle: bar\nrole: coder\n---\n',
    );
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'multi' });
    expect(tasks.map((t) => t.frontmatter.id).sort()).toEqual(['T1', 'T2']);
  });

  it('throws when planSlug is ambiguous across specs', async () => {
    await mkdir(join(dir, '.arandano', 'specs', 'A', 'plans', 'common'), { recursive: true });
    await mkdir(join(dir, '.arandano', 'specs', 'B', 'plans', 'common'), { recursive: true });
    await writeFile(
      join(dir, '.arandano', 'specs', 'A', 'plans', 'common', 'T1-foo.md'),
      '---\nid: T1\ntitle: foo\nrole: coder\n---\n',
    );
    await writeFile(
      join(dir, '.arandano', 'specs', 'B', 'plans', 'common', 'T1-foo.md'),
      '---\nid: T1\ntitle: foo\nrole: coder\n---\n',
    );
    await expect(loadPlan({ projectRoot: dir, planSlug: 'common' })).rejects.toThrow(/ambiguous/);
  });

  it('takes a specName option to disambiguate', async () => {
    await mkdir(join(dir, '.arandano', 'specs', 'A', 'plans', 'common'), { recursive: true });
    await mkdir(join(dir, '.arandano', 'specs', 'B', 'plans', 'common'), { recursive: true });
    await writeFile(
      join(dir, '.arandano', 'specs', 'A', 'plans', 'common', 'T1-a.md'),
      '---\nid: T1\ntitle: a\nrole: coder\n---\n',
    );
    await writeFile(
      join(dir, '.arandano', 'specs', 'B', 'plans', 'common', 'T1-b.md'),
      '---\nid: T1\ntitle: b\nrole: coder\n---\n',
    );
    const tasks = await loadPlan({ projectRoot: dir, planSlug: 'common', specName: 'A' });
    expect(tasks.map((t) => t.frontmatter.title)).toEqual(['a']);
  });
});
