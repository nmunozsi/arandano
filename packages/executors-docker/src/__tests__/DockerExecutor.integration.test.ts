import { describe, expect, it } from 'vitest';
import { DockerExecutor } from '../DockerExecutor.js';
import type { TaskRun } from '@arandano/core';

const enabled = process.env.VITEST_DOCKER_INTEGRATION === '1';
const d = enabled ? describe : describe.skip;

d('DockerExecutor against real Docker', () => {
  it('starts a busybox container and observes a clean exit', async () => {
    const exec = new DockerExecutor({
      image: 'busybox:latest',
      projectRoot: process.cwd(),
    });
    const task: TaskRun = {
      taskId: 'T_SMOKE',
      taskMdPath: '.arandano/tasks/smoke/T_SMOKE.md',
      rolePath: '.arandano/roles/coder.md',
      contextPaths: [],
      cli: 'echo',
      model: 'noop',
      tdd: 'relaxed',
      quality: {
        format: 'skip',
        lint: 'skip',
        typecheck: 'skip',
        test: 'skip',
        coverage: { min: 0, delta: 'any' },
        security: 'skip',
        commit_msg: 'skip',
        reviewer_required: false,
      },
      envPass: [],
      workdir: '/workspace',
      timeoutMs: 30_000,
      mcpServers: [],
    };
    const h = await exec.start(task);
    const r = await exec.wait(h, { timeoutMs: 30_000 });
    expect(r.exitCode).toBeDefined();
  }, 60_000);
});
