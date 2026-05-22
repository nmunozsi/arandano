import { describe, expect, it } from 'vitest';
import { buildContainerSpec } from '../containerSpec.js';
import type { TaskRun } from '@arandano/core';

const baseTask = (over: Partial<TaskRun> = {}): TaskRun => ({
  taskId: 'T1',
  taskMdPath: '.arandano/tasks/p/T1-foo.md',
  rolePath: '.arandano/roles/coder.md',
  contextPaths: ['src/CONTEXT.md', 'planning/memory/coding-standards.md'],
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
  envPass: ['GH_TOKEN', 'ANTHROPIC_API_KEY'],
  workdir: '/workspace',
  timeoutMs: 45 * 60_000,
  mcpServers: [],
  ...over,
});

describe('buildContainerSpec', () => {
  it('mounts the project root at the workdir', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'ghcr.io/nmunozsi/arandano-worker:1.0.0',
      projectRoot: '/abs/repo',
      runFolder: '2026-05-08T19-30Z-T1',
      hostEnv: { GH_TOKEN: 'abc', ANTHROPIC_API_KEY: 'def' },
    });
    expect(spec.HostConfig.Binds).toContain('/abs/repo:/workspace');
  });

  it('passes env vars listed in envPass when present in hostEnv', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: { GH_TOKEN: 'abc' },
    });
    expect(spec.Env).toContain('GH_TOKEN=abc');
    expect(spec.Env?.find((e) => e.startsWith('ANTHROPIC_API_KEY='))).toBeUndefined();
  });

  it('passes ARANDANO_* env so the worker knows what to do', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'x',
      projectRoot: '/r',
      runFolder: '2026-05-08T19-30Z-T1',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_TASK_ID=T1');
    expect(spec.Env).toContain('ARANDANO_TASK_MD=.arandano/tasks/p/T1-foo.md');
    expect(spec.Env).toContain('ARANDANO_ROLE_MD=.arandano/roles/coder.md');
    expect(spec.Env).toContain('ARANDANO_CLI=claude-code');
    expect(spec.Env).toContain('ARANDANO_MODEL=claude-sonnet-4-6');
    expect(spec.Env).toContain('ARANDANO_TDD=strict');
    expect(spec.Env).toContain('ARANDANO_RUN_FOLDER=2026-05-08T19-30Z-T1');
  });

  it('runs as a non-root user', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.User).toBeDefined();
    expect(spec.User).not.toBe('root');
  });

  it('includes envSet values directly in env', () => {
    const spec = buildContainerSpec({
      task: baseTask({
        envSet: {
          ARANDANO_PLAN_SLUG: 'smoke',
          ARANDANO_PLAN_PATH: '/workspace/.arandano/specs/arch-smoke/plans/smoke',
        },
      }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_PLAN_SLUG=smoke');
    expect(spec.Env).toContain(
      'ARANDANO_PLAN_PATH=/workspace/.arandano/specs/arch-smoke/plans/smoke',
    );
  });
});

describe('buildContainerSpec — npm cache volume', () => {
  it('includes the npm cache named volume bind', () => {
    const spec = buildContainerSpec({
      task: baseTask(),
      image: 'ghcr.io/nmunozsi/arandano-worker:1.0.0',
      projectRoot: '/abs/repo',
      runFolder: '2026-05-08T19-30Z-T1',
      hostEnv: {},
    });
    expect(spec.HostConfig.Binds).toContain('arandano-npm-cache:/home/worker/.npm');
  });
});

describe('buildContainerSpec — inject_context forwarding', () => {
  it('emits ARANDANO_INJECT_CONTEXT=<colon-separated> when injectContext has entries', () => {
    const spec = buildContainerSpec({
      task: baseTask({ injectContext: ['src/greet.ts'] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_INJECT_CONTEXT=src/greet.ts');
  });

  it('emits colon-separated paths when multiple injectContext entries given', () => {
    const spec = buildContainerSpec({
      task: baseTask({ injectContext: ['src/greet.ts', 'package.json'] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_INJECT_CONTEXT=src/greet.ts:package.json');
  });

  it('omits ARANDANO_INJECT_CONTEXT entirely when injectContext is empty', () => {
    const spec = buildContainerSpec({
      task: baseTask({ injectContext: [] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env?.find((e) => e.startsWith('ARANDANO_INJECT_CONTEXT='))).toBeUndefined();
  });

  it('omits ARANDANO_INJECT_CONTEXT entirely when injectContext is undefined', () => {
    const spec = buildContainerSpec({
      task: baseTask({ injectContext: undefined }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env?.find((e) => e.startsWith('ARANDANO_INJECT_CONTEXT='))).toBeUndefined();
  });
});

describe('buildContainerSpec — MCP servers forwarding', () => {
  it('emits ARANDANO_MCP_SERVERS=<single> when one server requested', () => {
    const spec = buildContainerSpec({
      task: baseTask({ mcpServers: ['gitnexus'] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_MCP_SERVERS=gitnexus');
  });

  it('emits ARANDANO_MCP_SERVERS=<csv> when multiple servers requested', () => {
    const spec = buildContainerSpec({
      task: baseTask({ mcpServers: ['gitnexus', 'foo'] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env).toContain('ARANDANO_MCP_SERVERS=gitnexus,foo');
  });

  it('omits ARANDANO_MCP_SERVERS entirely when no servers requested', () => {
    const spec = buildContainerSpec({
      task: baseTask({ mcpServers: [] }),
      image: 'x',
      projectRoot: '/r',
      runFolder: 'f',
      hostEnv: {},
    });
    expect(spec.Env?.find((e) => e.startsWith('ARANDANO_MCP_SERVERS='))).toBeUndefined();
  });
});
