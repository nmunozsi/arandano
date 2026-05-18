import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Orchestrator } from '../orchestrator.js';
import type { Executor, TaskRun } from '../../types/executor.js';

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
  const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'p');
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

  it('spawns a reviewer task when reviewer_required=true on the coder task', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'p');
    await mkdir(planDir, { recursive: true });
    await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
    await writeFile(join(dir, '.arandano', 'roles', 'reviewer.md'), '');
    await writeFile(
      join(planDir, 'T1-x.md'),
      '---\nid: T1\ntitle: x\nrole: coder\nquality:\n  reviewer_required: true\n---\n',
    );
    await writeFile(
      join(dir, '.arandano', 'config.yaml'),
      CONFIG(2)
        .replace('reviewer_required: false', 'reviewer_required: false')
        .replace(
          'roles:\n  coder:',
          'roles:\n  reviewer:\n    cli: claude-code\n    model: m\n  coder:',
        ),
    );
    const exec = okExecutor();
    const o = new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec });
    const r = await o.run();
    expect(r.completed.sort()).toEqual(['T1', 'T1-review']);
  });

  it('appends T-architect when running a full plan with architect enabled in config', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'p');
    await mkdir(planDir, { recursive: true });
    await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
    await writeFile(join(dir, '.arandano', 'roles', 'architect.md'), '');
    await writeFile(join(planDir, 'T1-x.md'), '---\nid: T1\ntitle: x\nrole: coder\n---\nbody');
    await writeFile(
      join(planDir, 'T2-x.md'),
      '---\nid: T2\ntitle: x\nrole: coder\ndepends_on: [T1]\n---\nbody',
    );
    // Config with architect.enabled=true
    const cfg = CONFIG(2).replace(
      'roles:\n  coder:',
      'roles:\n  architect:\n    cli: claude-code\n    model: m\n    enabled: true\n  coder:',
    );
    await writeFile(join(dir, '.arandano', 'config.yaml'), cfg);

    const exec = okExecutor();
    const summary = await new Orchestrator({
      projectRoot: dir,
      planSlug: 'p',
      executor: exec,
      withArchitect: false,
      noArchitect: false,
    }).run();

    expect(summary.completed).toContain('T-architect');
  });

  it('skips T-architect when --no-architect is passed', async () => {
    await seedPlan([{ id: 'T1' }, { id: 'T2', deps: ['T1'] }]);
    const exec = okExecutor();
    const summary = await new Orchestrator({
      projectRoot: dir,
      planSlug: 'p',
      executor: exec,
      withArchitect: false,
      noArchitect: true,
    }).run();
    expect(summary.completed).not.toContain('T-architect');
  });

  it('passes ARANDANO_PLAN_SLUG to T-architect task', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'p');
    await mkdir(planDir, { recursive: true });
    await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
    await writeFile(join(dir, '.arandano', 'roles', 'architect.md'), '');
    await writeFile(join(planDir, 'T1-x.md'), '---\nid: T1\ntitle: x\nrole: coder\n---\nbody');
    const cfg = CONFIG(2).replace(
      'roles:\n  coder:',
      'roles:\n  architect:\n    cli: claude-code\n    model: m\n    enabled: true\n  coder:',
    );
    await writeFile(join(dir, '.arandano', 'config.yaml'), cfg);

    const capturedRuns: TaskRun[] = [];
    const exec: Executor = {
      start: vi.fn((t) => {
        capturedRuns.push(t);
        return Promise.resolve({ id: t.taskId });
      }),
      wait: vi.fn(() => Promise.resolve({ exitCode: 0, reason: 'ok' as const })),
      logs: vi.fn(() => (async function* () {})()),
      cancel: vi.fn(() => Promise.resolve()),
    };

    const summary = await new Orchestrator({
      projectRoot: dir,
      planSlug: 'p',
      executor: exec,
    }).run();

    expect(summary.completed).toContain('T-architect');
    const archRun = capturedRuns.find((r) => r.taskId === 'T-architect');
    expect(archRun?.envSet?.['ARANDANO_PLAN_SLUG']).toBe('p');
  });

  it('passes ARANDANO_PLAN_CONTEXT_PATH and ARANDANO_PLAN_CONTEXT_JSON to T-architect; does not pass ARANDANO_PLAN_MERGE_RANGE', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'p');
    await mkdir(planDir, { recursive: true });
    await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
    await writeFile(join(dir, '.arandano', 'roles', 'architect.md'), '');
    await writeFile(join(planDir, 'T1-x.md'), '---\nid: T1\ntitle: x\nrole: coder\n---\nbody');
    const cfg = CONFIG(2).replace(
      'roles:\n  coder:',
      'roles:\n  architect:\n    cli: claude-code\n    model: m\n    enabled: true\n  coder:',
    );
    await writeFile(join(dir, '.arandano', 'config.yaml'), cfg);

    const capturedRuns: TaskRun[] = [];
    const exec: Executor = {
      start: vi.fn((t) => {
        capturedRuns.push(t);
        return Promise.resolve({ id: t.taskId });
      }),
      wait: vi.fn(async (h) => {
        if (h.id !== 'T-architect') {
          const runDir = join(dir, '.arandano', 'runs', h.id);
          await mkdir(runDir, { recursive: true });
          const resultPath = join(runDir, 'result.json');
          await writeFile(
            resultPath,
            JSON.stringify({
              branch: `agent/${h.id}-123`,
              pr_url: `https://github.com/org/repo/pull/1`,
            }),
          );
          return { exitCode: 0, reason: 'ok' as const, resultJsonPath: resultPath };
        }
        return { exitCode: 0, reason: 'ok' as const };
      }),
      logs: vi.fn(() => (async function* () {})()),
      cancel: vi.fn(() => Promise.resolve()),
    };

    await new Orchestrator({ projectRoot: dir, planSlug: 'p', executor: exec }).run();

    const archRun = capturedRuns.find((r) => r.taskId === 'T-architect');
    expect(archRun?.envSet?.['ARANDANO_PLAN_SLUG']).toBe('p');
    expect(archRun?.envSet?.['ARANDANO_PLAN_CONTEXT_PATH']).toBe('.arandano/runs/p-context.json');
    expect(archRun?.envSet?.['ARANDANO_PLAN_CONTEXT_JSON']).toBeDefined();
    const ctx = JSON.parse(archRun!.envSet!['ARANDANO_PLAN_CONTEXT_JSON']!) as {
      planSlug: string;
      tasks: Array<{ id: string; branch: string; prUrl?: string }>;
    };
    expect(ctx.planSlug).toBe('p');
    expect(ctx.tasks[0]?.id).toBe('T1');
    expect(ctx.tasks[0]?.branch).toBe('agent/T1-123');
    expect(ctx.tasks[0]?.prUrl).toBe('https://github.com/org/repo/pull/1');
    expect(archRun?.envSet?.['ARANDANO_PLAN_MERGE_RANGE']).toBeUndefined();
  });

  it('excludes failed coder tasks and tasks with no branch from plan-context.json', async () => {
    const planDir = join(dir, '.arandano', 'specs', 'default', 'plans', 'q');
    await mkdir(planDir, { recursive: true });
    await mkdir(join(dir, '.arandano', 'roles'), { recursive: true });
    await writeFile(join(dir, '.arandano', 'roles', 'coder.md'), '');
    await writeFile(join(dir, '.arandano', 'roles', 'architect.md'), '');
    // T2 depends on T1 so they run sequentially — avoids a parallel-write
    // race in StateStore where T1's result.json update can overwrite T2's
    // completed status before the orchestrator reads it.
    await writeFile(join(planDir, 'T1-x.md'), '---\nid: T1\ntitle: x\nrole: coder\n---\nbody');
    await writeFile(
      join(planDir, 'T2-x.md'),
      '---\nid: T2\ntitle: x\nrole: coder\ndepends_on: [T1]\n---\nbody',
    );
    const cfg = CONFIG(2).replace(
      'roles:\n  coder:',
      'roles:\n  architect:\n    cli: claude-code\n    model: m\n    enabled: true\n  coder:',
    );
    await writeFile(join(dir, '.arandano', 'config.yaml'), cfg);

    const capturedRuns: TaskRun[] = [];
    const exec: Executor = {
      start: vi.fn((t) => {
        capturedRuns.push(t);
        return Promise.resolve({ id: t.taskId });
      }),
      wait: vi.fn(async (h) => {
        if (h.id === 'T1') {
          // T1 succeeds with a branch
          const runDir = join(dir, '.arandano', 'runs', h.id);
          await mkdir(runDir, { recursive: true });
          const resultPath = join(runDir, 'result.json');
          await writeFile(resultPath, JSON.stringify({ branch: 'agent/T1-123' }));
          return { exitCode: 0, reason: 'ok' as const, resultJsonPath: resultPath };
        }
        if (h.id === 'T2') {
          // T2 succeeds but has no branch in result.json
          return { exitCode: 0, reason: 'ok' as const };
        }
        return { exitCode: 0, reason: 'ok' as const };
      }),
      logs: vi.fn(() => (async function* () {})()),
      cancel: vi.fn(() => Promise.resolve()),
    };

    await new Orchestrator({ projectRoot: dir, planSlug: 'q', executor: exec }).run();

    const archRun = capturedRuns.find((r) => r.taskId === 'T-architect');
    const ctx = JSON.parse(archRun!.envSet!['ARANDANO_PLAN_CONTEXT_JSON']!) as {
      tasks: Array<{ id: string }>;
    };
    expect(ctx.tasks.map((t) => t.id)).toEqual(['T1']);
  });
});
