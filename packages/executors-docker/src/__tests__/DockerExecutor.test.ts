import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DockerExecutor } from '../DockerExecutor.js';
import type { TaskRun } from '@arandano/core';

function fakeContainer() {
  return {
    id: 'cont-123',
    start: vi.fn(() => Promise.resolve()),
    wait: vi.fn(() => Promise.resolve({ StatusCode: 0 })),
    stop: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    logs: vi.fn(async () => {
      const { Readable } = await import('node:stream');
      return Readable.from([Buffer.from('hello\n')]);
    }),
  };
}

const task: TaskRun = {
  taskId: 'T1',
  taskMdPath: 'p',
  rolePath: 'r',
  contextPaths: [],
  cli: 'claude-code',
  model: 'claude-sonnet-4-6',
  tdd: 'strict',
  quality: {
    format: 'required',
    lint: 'required',
    typecheck: 'required',
    test: 'required',
    coverage: { min: 80, delta: 'any' },
    security: 'warn',
    commit_msg: 'conventional',
    reviewer_required: false,
  },
  envPass: [],
  workdir: '/workspace',
  timeoutMs: 60_000,
  mcpServers: [],
};

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'arandano-executor-test-'));
  // Ensure .arandano/runs exists so cp in wait() doesn't fail unexpectedly
  await mkdir(join(projectRoot, '.arandano', 'runs'), { recursive: true });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('DockerExecutor', () => {
  it('starts a container and returns a handle', async () => {
    const c = fakeContainer();
    const client = {
      pull: vi.fn(() => Promise.resolve()),
      createContainer: vi.fn(() => Promise.resolve(c)),
    };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot,
      client: client as never,
      hostEnv: {},
      now: () => new Date('2026-05-08T19:30:00Z'),
      cloneProject: async () => {},
    });
    const h = await exec.start(task);
    expect(h.id).toContain('T1');
    expect(c.start).toHaveBeenCalled();
  });

  it('reports ok exit when container exits 0', async () => {
    const c = fakeContainer();
    const client = {
      pull: vi.fn(() => Promise.resolve()),
      createContainer: vi.fn(() => Promise.resolve(c)),
    };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot,
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
      cloneProject: async () => {},
    });
    const h = await exec.start(task);
    const res = await exec.wait(h);
    expect(res.exitCode).toBe(0);
    expect(res.reason).toBe('ok');
    expect(res.resultJsonPath).toContain('result.json');
  });

  it('reports error exit when container exits non-zero', async () => {
    const c = fakeContainer();
    c.wait = vi.fn(() => Promise.resolve({ StatusCode: 7 }));
    const client = {
      pull: vi.fn(() => Promise.resolve()),
      createContainer: vi.fn(() => Promise.resolve(c)),
    };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot,
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
      cloneProject: async () => {},
    });
    const h = await exec.start(task);
    const res = await exec.wait(h);
    expect(res.exitCode).toBe(7);
    expect(res.reason).toBe('error');
  });

  it('cancel calls stop on the container', async () => {
    const c = fakeContainer();
    const client = {
      pull: vi.fn(() => Promise.resolve()),
      createContainer: vi.fn(() => Promise.resolve(c)),
    };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot,
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
      cloneProject: async () => {},
    });
    const h = await exec.start(task);
    await exec.cancel(h);
    expect(c.stop).toHaveBeenCalled();
  });

  it('reads cli_tool_calls and cli_commits from worker timings.json into bench.csv', async () => {
    const c = fakeContainer();
    const client = {
      pull: vi.fn(() => Promise.resolve()),
      createContainer: vi.fn(() => Promise.resolve(c)),
    };
    const fixedNow = new Date('2026-05-22T10:00:00Z');
    const exec = new DockerExecutor({
      image: 'sha256:testimg',
      projectRoot,
      client: client as never,
      hostEnv: {},
      now: () => fixedNow,
      cloneProject: async () => {},
    });

    // The cloneProject stub does nothing, but wait() will try to cp the run folder.
    // We need to pre-create the run folder in projectRoot with a timings.json that has
    // cli_tool_calls and cli_commits set.
    const h = await exec.start(task);
    // Derive the folder name from the handle (folder is embedded as second segment after ::)
    // Actually wait() uses entry.folder — we need to create timings.json after start but before wait.
    // The folder is the value stored internally, so we reconstruct it by looking at what
    // runFolder() would produce. Instead, intercept by writing the timings.json into a path
    // that wait() will cp from. Since cloneProject does nothing, the clone dir is empty,
    // but wait() does cp(cloneRunDir, mainRunDir) with .catch(() => {}), then reads
    // timings from mainRunDir (projectRoot). So we write directly to projectRoot.
    //
    // We first need the folder name. start() derives it from runFolder(). Let's just
    // wait for the container to exit and then check what folder was created.
    //
    // Simpler approach: write the timings after waiting, but that's too late.
    // Instead, mock container.wait() to pause long enough to inject the file.
    // Easiest: make wait() itself inject before the wait resolves by using a custom
    // wait impl that writes the file first.
    //
    // Actually the simplest approach: override cloneProject to write timings.json
    // into the clone dir so cp picks it up. But cloneProject runs before start returns...
    //
    // The real approach: let wait() complete with StatusCode 0, then the bench row
    // is written with cli_tool_calls=0. To test the positive path, we need the
    // timings.json in mainRunDir BEFORE mergeBenchRow is called but AFTER container.wait().
    // We can't easily intercept that. Instead, write a synthetic timings.json to
    // projectRoot/.arandano/runs/<folder> before calling exec.wait(). But we don't know
    // the folder name until after exec.start().
    //
    // Let's derive the folder from the handle id format.
    // handle id = `${taskId}::${containerId}` — not the folder.
    // We need to use the same runFolder() logic. Let's import it.

    // Instead, extract the folder by checking what's been created after wait completes
    // (bench.csv will be written) and then verify it has the right values.
    // For simplicity: write a synthetic timings.json to ALL possible .arandano/runs/* dirs.
    // Actually the simplest testable path: write the timings into the mainRunDir after
    // the wait starts but before the bench row is written. We can't do that synchronously.
    //
    // Best practical approach: use a custom cloneProject that creates the run folder with
    // a synthetic timings.json. The clone dir IS the workspace the container uses.
    // wait() does cp(cloneRunDir, mainRunDir) THEN reads mainRunDir.
    // So if cloneProject creates <cloneDir>/.arandano/runs/<folder>/timings.json,
    // it will be cp'd to mainRunDir and then read.
    //
    // But we don't know <folder> at cloneProject time either — it's derived from now().
    // Since we fixed now() = fixedNow, we can compute the folder.

    // Folder format from runFolder: `${taskId}-${YYYY-MM-DD}` or similar.
    // Let's just wait() and check what bench.csv has, using timings injected via
    // a custom cloneProject that writes the folder using the known fixedNow.

    // The test as written above already passed start(). Let's just wait and verify
    // cli_tool_calls = 0 is present (default path). For the positive path we need
    // a separate test with a custom cloneProject.

    const res = await exec.wait(h);
    expect(res.exitCode).toBe(0);

    // bench.csv should now exist with cli_tool_calls and cli_commits columns
    const csvPath = join(projectRoot, '.arandano', 'bench.csv');
    const csvContent = await readFile(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(Boolean);
    expect(lines[0]).toContain('cli_tool_calls');
    expect(lines[0]).toContain('cli_commits');
    // data row should contain both 0s (no timings.json present → defaults to 0)
    expect(lines[1]).toMatch(/,0,0$/);
  });

  it('reads cli_tool_calls=42 cli_commits=3 from timings.json when present in clone', async () => {
    const c = fakeContainer();
    const client = {
      pull: vi.fn(() => Promise.resolve()),
      createContainer: vi.fn(() => Promise.resolve(c)),
    };
    const fixedNow = new Date('2026-05-22T11:00:00Z');

    // Custom cloneProject that writes a timings.json with cli_tool_calls and cli_commits
    // into the expected run folder location in the clone dir.
    // We compute the folder name the same way DockerExecutor does.
    const { runFolder } = await import('@arandano/core');
    const folder = runFolder({ taskId: task.taskId, date: fixedNow });
    const cloneDirs: string[] = [];

    const cloneProject = async (src: string, dst: string) => {
      cloneDirs.push(dst);
      const runDir = join(dst, '.arandano', 'runs', folder);
      await mkdir(runDir, { recursive: true });
      const timings = {
        task_id: task.taskId,
        total_ms: 120000,
        stack: 'node-ts',
        worker: { cli: 90000, install: 20000, push_and_pr: 5000 },
        cli_tool_calls: 42,
        cli_commits: 3,
      };
      await writeFile(join(runDir, 'timings.json'), JSON.stringify(timings, null, 2), 'utf8');
    };

    const exec = new DockerExecutor({
      image: 'sha256:testimg2',
      projectRoot,
      client: client as never,
      hostEnv: {},
      now: () => fixedNow,
      cloneProject,
    });

    const h = await exec.start(task);
    await exec.wait(h);

    const csvPath = join(projectRoot, '.arandano', 'bench.csv');
    const csvContent = await readFile(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(Boolean);
    expect(lines[0]).toContain('cli_tool_calls');
    // data row should contain 42 and 3
    expect(lines[1]).toContain(',42,3');
  });
});
