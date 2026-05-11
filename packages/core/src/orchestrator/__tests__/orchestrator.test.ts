import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Orchestrator } from '../orchestrator.js';
import type { Executor } from '../../types/executor.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-orch-'));
  return async () => rm(dir, { recursive: true, force: true });
});

const CONFIG = (maxParallel: number) => `
project:
  name: x
  default_branch: main
executor:
  backend: docker
  docker:
    image: i
    workdir: /workspace
    plugins_mount: baked-in
    env_pass: []
git:
  forge: github
  remote: origin
  branch_prefix: agent/
  open_pr: true
roles:
  coder:
    cli: claude-code
    model: m
    tdd: strict
quality_defaults:
  format: required
  lint: required
  typecheck: required
  test: required
  coverage:
    min: 80
    delta: any
  security: warn
  commit_msg: conventional
  reviewer_required: false
batching:
  max_parallel: ${maxParallel}
  timeout_minutes: 1
  retry_policy:
    max_attempts: 1
    on: [container_error]
`;

async function seedPlan(ids: Array<{ id: string; deps?: string[] }>, maxParallel = 2) {
  const planDir = join(dir, '.arandano', 'tasks', 'p');
  await mkdir(planDir, { recursive: true });
  await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
  await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '# coder');
  for (const t of ids) {
    const deps = t.deps ? `depends_on: [${t.deps.join(', ')}]\n` : '';
    await writeFile(
      join(planDir, `${t.id}-x.md`),
      `---\nid: ${t.id}\ntitle: x\nrole: coder\n${deps}---\nbody`,
    );
  }
  await writeFile(join(dir, '.arandano', 'config.yaml'), CONFIG(maxParallel));
}

const okExecutor = (): Executor => ({
  start: vi.fn((t) => Promise.resolve({ id: t.taskId })),
  wait: vi.fn(() => Promise.resolve({ exitCode: 0, reason: 'ok' as const })),
  logs: vi.fn(() => (async function* () {})()),
  cancel: vi.fn(() => Promise.resolve()),
});

describe('Orchestrator', () => {
  it('runs all tasks when no failures', async () => {
    await seedPlan([{ id: 'T1' }, { id: 'T2', deps: ['T1'] }]);
    const exec = okExecutor();
    const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
    const summary = await o.run();
    expect(summary.completed.sort()).toEqual(['T1', 'T2']);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(exec.start).toHaveBeenCalledTimes(2);
  });

  it('does not start a task whose dep failed', async () => {
    await seedPlan([{ id: 'T1' }, { id: 'T2', deps: ['T1'] }]);
    const exec: Executor = {
      ...okExecutor(),
      wait: vi.fn(() => Promise.resolve({ exitCode: 1, reason: 'error' as const })),
    };
    const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
    const summary = await o.run();
    expect(summary.failed).toEqual(['T1']);
    expect(summary.skipped).toEqual(['T2']);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(exec.start).toHaveBeenCalledTimes(1);
  });

  it('respects max_parallel', async () => {
    await seedPlan([{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }], 2);
    let active = 0;
    let peak = 0;
    const exec: Executor = {
      start: vi.fn((t) => {
        active += 1;
        peak = Math.max(peak, active);
        return Promise.resolve({ id: t.taskId });
      }),
      wait: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
        return { exitCode: 0, reason: 'ok' as const };
      }),
      logs: vi.fn(() => (async function* () {})()),
      cancel: vi.fn(() => Promise.resolve()),
    };
    const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
    await o.run();
    expect(peak).toBeLessThanOrEqual(2);
  });
});
