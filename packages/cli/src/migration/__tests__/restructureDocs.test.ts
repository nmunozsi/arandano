import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restructureMonorepoDocs, migrateUserProjectTasks } from '../restructureDocs.js';

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'arandano-mig-orch-'));
  return async () => rm(repo, { recursive: true, force: true });
});

async function seedMonorepoSample() {
  await mkdir(join(repo, 'docs', 'plans'), { recursive: true });
  await writeFile(
    join(repo, 'docs', 'plans', '2026-05-08-phase-1-node-ts-mvp.md'),
    '# arandano Phase 1\n\n**Goal:** A\n\n---\n\n## Task 1: One\n\n- [ ] step\n',
  );
  await writeFile(join(repo, 'arandano-design.md'), '# arandano Design\n\nMaster.');
}

describe('restructureMonorepoDocs', () => {
  it('moves arandano-design.md into docs/initial-build/spec.md', async () => {
    await seedMonorepoSample();
    await restructureMonorepoDocs({ repoRoot: repo });
    const spec = await readFile(join(repo, 'docs', 'initial-build', 'spec.md'), 'utf8');
    expect(spec).toContain('# arandano Design');
    expect(spec).toMatch(/^> \*\*Location:\*\* `docs\/initial-build\/spec\.md`/);
    const stub = await readFile(join(repo, 'arandano-design.md'), 'utf8');
    expect(stub).toContain('Moved to docs/initial-build/spec.md');
  });

  it('splits each existing phase plan into a phase folder under v1-rollout', async () => {
    await seedMonorepoSample();
    await restructureMonorepoDocs({ repoRoot: repo });
    const phaseDir = join(
      repo,
      'docs',
      'initial-build',
      'plans',
      'v1-rollout',
      'phase-1-node-ts-mvp',
    );
    const entries = await readdir(phaseDir);
    expect(entries.sort()).toEqual(['T1-one.md', 'phase.md']);
  });

  it('writes a top-level plan.md listing every phase as a checkbox', async () => {
    await seedMonorepoSample();
    await restructureMonorepoDocs({ repoRoot: repo });
    const planMd = await readFile(
      join(repo, 'docs', 'initial-build', 'plans', 'v1-rollout', 'plan.md'),
      'utf8',
    );
    expect(planMd).toContain('- [ ] [phase-1 — node-ts-mvp](phase-1-node-ts-mvp/phase.md)');
  });
});

describe('migrateUserProjectTasks', () => {
  it('moves .arandano/tasks/<slug>/T*.md into .arandano/specs/<spec>/plans/<slug>/', async () => {
    const proj = await mkdtemp(join(tmpdir(), 'arandano-userproj-'));
    await mkdir(join(proj, '.arandano', 'tasks', '2026-05-11-three-helpers'), { recursive: true });
    await writeFile(
      join(proj, '.arandano', 'tasks', '2026-05-11-three-helpers', 'T4-add-uppercase.md'),
      '---\nid: T4\ntitle: x\nrole: coder\n---\nbody',
    );
    await migrateUserProjectTasks({ projectRoot: proj, specName: 'helpers' });
    const moved = await readFile(
      join(
        proj,
        '.arandano',
        'specs',
        'helpers',
        'plans',
        '2026-05-11-three-helpers',
        'T4-add-uppercase.md',
      ),
      'utf8',
    );
    expect(moved).toContain('id: T4');
    // Old tasks/ tree gone
    await expect(readdir(join(proj, '.arandano', 'tasks'))).rejects.toThrow();
    await rm(proj, { recursive: true, force: true });
  });
});
