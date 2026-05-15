import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MigrateDocs from '../commands/migrate/docs.js';

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'arandano-mig-cmd-'));
  return async () => rm(repo, { recursive: true, force: true });
});

async function seed() {
  await mkdir(join(repo, 'docs', 'plans'), { recursive: true });
  await writeFile(
    join(repo, 'docs', 'plans', '2026-05-08-phase-1-node-ts-mvp.md'),
    '# x\n\nGoal\n\n---\n\n## Task 1: One\n\n- [ ] step\n',
  );
  await writeFile(join(repo, 'arandano-design.md'), '# x');
}

describe('arandano migrate docs', () => {
  it('--dry-run (default) does not modify any files', async () => {
    await seed();
    const logs: string[] = [];
    const fakeConfig = { runHook: () => Promise.resolve({ successes: [], failures: [] }) };
    const cmd = new MigrateDocs(['--project', repo], fakeConfig as never);
    cmd.log = (m?: unknown) => logs.push(String(m));
    await cmd.run();
    // Original files still present
    await expect(readFile(join(repo, 'arandano-design.md'), 'utf8')).resolves.toContain('# x');
    await expect(readdir(join(repo, 'docs', 'initial-build'))).rejects.toThrow();
    expect(logs.join('\n')).toMatch(/dry.?run/i);
  });

  it('--commit performs the migration', async () => {
    await seed();
    const fakeConfig2 = { runHook: () => Promise.resolve({ successes: [], failures: [] }) };
    const cmd = new MigrateDocs(['--project', repo, '--commit'], fakeConfig2 as never);
    cmd.log = () => {};
    await cmd.run();
    const entries = await readdir(join(repo, 'docs', 'initial-build', 'plans', 'v1-rollout'));
    expect(entries).toContain('phase-1-node-ts-mvp');
  });
});
