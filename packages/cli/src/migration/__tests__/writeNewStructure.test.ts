import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeNewStructure } from '../writeNewStructure.js';
import type { ParsedPhasePlan } from '../parsePhasePlan.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-mig-write-'));
  return async () => rm(dir, { recursive: true, force: true });
});

const parsed: ParsedPhasePlan = {
  preamble: '# arandano Phase 2 — Example\n\n**Goal:** A test.',
  tasks: [
    { number: 1, title: 'First (TDD)', body: '## Task 1: First (TDD)\n\n- [ ] step a' },
    { number: 2, title: 'Second', body: '## Task 2: Second\n\n- [ ] step b' },
  ],
  exitCriteria: '- [ ] All works',
};

describe('writeNewStructure', () => {
  it('writes phase.md + T*.md files into the destination', async () => {
    const destFolder = 'docs/initial-build/plans/v1-rollout/phase-2-example';
    await writeNewStructure({
      repoRoot: dir,
      destRelPath: destFolder,
      parsed,
      mode: 'phase',
    });
    const fullDest = join(dir, destFolder);
    const entries = await readdir(fullDest);
    expect(entries.sort()).toEqual(['T1-first.md', 'T2-second.md', 'phase.md']);
    const phase = await readFile(join(fullDest, 'phase.md'), 'utf8');
    expect(phase).toContain('> **Location:** `' + destFolder + '/phase.md`');
    expect(phase).toContain('- [ ] [T1 — First (TDD)](T1-first.md)');
    expect(phase).toContain('- [ ] [T2 — Second](T2-second.md)');
    expect(phase).toContain('**Goal:** A test.');
  });

  it('writes plan.md instead of phase.md when mode=plan (single-phase collapsed)', async () => {
    const destFolder = 'docs/perf/plans/instrumentation';
    await writeNewStructure({
      repoRoot: dir,
      destRelPath: destFolder,
      parsed,
      mode: 'plan',
    });
    const fullDest = join(dir, destFolder);
    const entries = await readdir(fullDest);
    expect(entries.sort()).toEqual(['T1-first.md', 'T2-second.md', 'plan.md']);
  });

  it('produces T<N>-<kebab-slug>.md filenames from task titles', async () => {
    const destFolder = 'docs/x/plans/y';
    await writeNewStructure({
      repoRoot: dir,
      destRelPath: destFolder,
      parsed: {
        preamble: '# x',
        tasks: [{ number: 7, title: 'Add the Foo Bar (TDD)', body: '## Task 7: ...' }],
        exitCriteria: null,
      },
      mode: 'plan',
    });
    const entries = await readdir(join(dir, destFolder));
    expect(entries).toContain('T7-add-the-foo-bar.md');
  });

  it('prepends a Location header to every task file', async () => {
    const destFolder = 'docs/x/plans/y/phase-1-a';
    await writeNewStructure({
      repoRoot: dir,
      destRelPath: destFolder,
      parsed,
      mode: 'phase',
    });
    const t1 = await readFile(join(dir, destFolder, 'T1-first.md'), 'utf8');
    expect(t1).toMatch(/^> \*\*Location:\*\* `docs\/x\/plans\/y\/phase-1-a\/T1-first\.md`/);
    expect(t1).toContain('← you are here');
  });
});
