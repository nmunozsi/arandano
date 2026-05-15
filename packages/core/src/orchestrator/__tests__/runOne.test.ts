import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOne } from '../runOne.js';
import type { Executor } from '../../types/executor.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-runone-'));
  return async () => rm(dir, { recursive: true, force: true });
});

async function seedProject() {
  await mkdir(join(dir, '.arandano', 'specs', 'default', 'plans', 'p'), { recursive: true });
  await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, 'planning', 'memory'), { recursive: true });
  await writeFile(join(dir, 'src', 'CONTEXT.md'), '# src');
  await writeFile(join(dir, 'planning', 'memory', 'coding-standards.md'), '# standards');
  await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '# coder');
  await writeFile(
    join(dir, '.arandano', 'specs', 'default', 'plans', 'p', 'T1-foo.md'),
    '---\nid: T1\ntitle: foo\nrole: coder\n---\nbody',
  );
  await writeFile(
    join(dir, '.arandano', 'config.yaml'),
    `project: { name: x, default_branch: main }
executor: { backend: docker, docker: { image: img, workdir: /workspace, plugins_mount: baked-in, env_pass: [] } }
git: { forge: github, remote: origin, branch_prefix: agent/, open_pr: true }
roles: { coder: { cli: claude-code, model: claude-sonnet-4-6, tdd: strict } }
quality_defaults: { format: required, lint: required, typecheck: required, test: required, coverage: { min: 80, delta: any }, security: warn, commit_msg: conventional, reviewer_required: false }
batching: { max_parallel: 1, timeout_minutes: 45, retry_policy: { max_attempts: 1, on: [container_error] } }
`,
  );
}

const okExecutor = (): Executor => ({
  start: vi.fn(() => Promise.resolve({ id: 'h-1' })),
  wait: vi.fn(() => Promise.resolve({ exitCode: 0, reason: 'ok' as const })),
  logs: vi.fn(async function* () {}),
  cancel: vi.fn(() => Promise.resolve()),
});

describe('runOne', () => {
  it('marks the task completed when the executor returns ok', async () => {
    await seedProject();
    const exec = okExecutor();
    const result = await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    expect(result.exitCode).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(exec.start).toHaveBeenCalledTimes(1);
  });

  it('marks the task failed when the executor returns non-zero', async () => {
    await seedProject();
    const exec = {
      ...okExecutor(),
      wait: vi.fn(() => Promise.resolve({ exitCode: 1, reason: 'error' as const })),
    };
    const result = await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    expect(result.exitCode).toBe(1);
  });

  it('errors when the task id does not exist', async () => {
    await seedProject();
    await expect(
      runOne({ projectRoot: dir, taskId: 'T999', executor: okExecutor() }),
    ).rejects.toThrow(/T999/);
  });
});
