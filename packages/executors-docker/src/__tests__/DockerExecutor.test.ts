import { describe, expect, it, vi } from 'vitest';
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

describe('DockerExecutor', () => {
  it('starts a container and returns a handle', async () => {
    const c = fakeContainer();
    const client = {
      pull: vi.fn(() => Promise.resolve()),
      createContainer: vi.fn(() => Promise.resolve(c)),
    };
    const exec = new DockerExecutor({
      image: 'x',
      projectRoot: '/r',
      client: client as never,
      hostEnv: {},
      now: () => new Date('2026-05-08T19:30:00Z'),
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
      projectRoot: '/r',
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
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
      projectRoot: '/r',
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
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
      projectRoot: '/r',
      client: client as never,
      hostEnv: {},
      now: () => new Date(),
    });
    const h = await exec.start(task);
    await exec.cancel(h);
    expect(c.stop).toHaveBeenCalled();
  });
});
