import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

describe('runOne — result.json back-propagation', () => {
  it('writes branch and pr_url to state.json after a successful run', async () => {
    await seedProject();
    const runDir = join(dir, '.arandano', 'runs', 'test-run');
    await mkdir(runDir, { recursive: true });
    const resultPath = join(runDir, 'result.json');
    await writeFile(
      resultPath,
      JSON.stringify({ branch: 'agent/T1-1234', pr_url: 'https://github.com/org/repo/pull/7' }),
    );
    const exec: Executor = {
      ...okExecutor(),
      wait: vi.fn(() =>
        Promise.resolve({ exitCode: 0, reason: 'ok' as const, resultJsonPath: resultPath }),
      ),
    };
    await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    const state = JSON.parse(await readFile(join(dir, '.arandano', 'state.json'), 'utf8')) as {
      tasks: Record<string, { branch?: string; pr_url?: string }>;
    };
    expect(state.tasks['T1']?.branch).toBe('agent/T1-1234');
    expect(state.tasks['T1']?.pr_url).toBe('https://github.com/org/repo/pull/7');
  });

  it('completes successfully when resultJsonPath points to a missing file', async () => {
    await seedProject();
    const exec: Executor = {
      ...okExecutor(),
      wait: vi.fn(() =>
        Promise.resolve({
          exitCode: 0,
          reason: 'ok' as const,
          resultJsonPath: join(dir, 'does-not-exist.json'),
        }),
      ),
    };
    const result = await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    expect(result.reason).toBe('ok');
  });

  it('completes successfully when result.json contains malformed JSON', async () => {
    await seedProject();
    const runDir = join(dir, '.arandano', 'runs', 'bad-run');
    await mkdir(runDir, { recursive: true });
    const resultPath = join(runDir, 'result.json');
    await writeFile(resultPath, 'not valid json {{{');
    const exec: Executor = {
      ...okExecutor(),
      wait: vi.fn(() =>
        Promise.resolve({ exitCode: 0, reason: 'ok' as const, resultJsonPath: resultPath }),
      ),
    };
    const result = await runOne({ projectRoot: dir, taskId: 'T1', executor: exec });
    expect(result.reason).toBe('ok');
  });
});

describe('runOne — gitnexus cache pre-warm', () => {
  it('calls ensureGitnexusCacheHost exactly once when mcpServers includes "gitnexus"', async () => {
    await seedProject();
    const taskPath = join(dir, '.arandano', 'specs', 'default', 'plans', 'p', 'T1-x.md');
    await mkdir(dirname(taskPath), { recursive: true });
    await writeFile(taskPath, '---\nid: T1\ntitle: x\nrole: coder\nmcp:\n  - gitnexus\n---\nbody');
    const ensureSpy = vi.fn().mockResolvedValue('cache-hit');
    vi.doMock('../../mcp/cacheHost.js', () => ({ ensureGitnexusCacheHost: ensureSpy }));
    await runOne({
      projectRoot: dir,
      taskId: 'T1',
      executor: okExecutor(),
      taskFilePath: taskPath,
    });
    expect(ensureSpy).toHaveBeenCalledTimes(1);
    const firstCall = ensureSpy.mock.calls[0] as unknown[];
    expect(firstCall[0]).toBe(dir);
    vi.doUnmock('../../mcp/cacheHost.js');
  });

  it('does NOT call ensureGitnexusCacheHost when mcpServers is empty', async () => {
    await seedProject();
    const ensureSpy = vi.fn();
    vi.doMock('../../mcp/cacheHost.js', () => ({ ensureGitnexusCacheHost: ensureSpy }));
    await runOne({ projectRoot: dir, taskId: 'T1', executor: okExecutor() });
    expect(ensureSpy).not.toHaveBeenCalled();
    vi.doUnmock('../../mcp/cacheHost.js');
  });

  it('dispatches the task even when ensureGitnexusCacheHost returns "failed"', async () => {
    await seedProject();
    const taskPath = join(dir, '.arandano', 'specs', 'default', 'plans', 'p', 'T1-x.md');
    await mkdir(dirname(taskPath), { recursive: true });
    await writeFile(taskPath, '---\nid: T1\ntitle: x\nrole: coder\nmcp:\n  - gitnexus\n---\nbody');
    vi.doMock('../../mcp/cacheHost.js', () => ({
      ensureGitnexusCacheHost: vi.fn().mockResolvedValue('failed'),
    }));
    const startSpy = vi.fn(() => Promise.resolve({ id: 'T1' }));
    const exec: Executor = { ...okExecutor(), start: startSpy };
    const r = await runOne({
      projectRoot: dir,
      taskId: 'T1',
      executor: exec,
      taskFilePath: taskPath,
    });
    expect(startSpy).toHaveBeenCalled();
    expect(r.reason).toBe('ok');
    vi.doUnmock('../../mcp/cacheHost.js');
  });
});
