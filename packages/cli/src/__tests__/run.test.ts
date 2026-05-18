import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async (orig) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const real = (await orig()) as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...real,
    readFile: vi.fn(() =>
      Promise.resolve('executor:\n  docker:\n    image: ghcr.io/test/worker:0\n'),
    ),
  };
});

const mockOrchestratorRun = vi.fn(() =>
  Promise.resolve({ completed: ['T1'], failed: [], skipped: [] }),
);

vi.mock('@arandano/core', async (orig) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const real = (await orig()) as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...real,
    runOne: vi.fn(() => Promise.resolve({ exitCode: 0, reason: 'ok' })),
    Orchestrator: vi.fn(() => ({ run: mockOrchestratorRun })),
  };
});

import Run from '../commands/run.js';
import { runOne, Orchestrator } from '@arandano/core';

describe('arandano run', () => {
  it('calls runOne with the task id', async () => {
    await Run.run(['T1']);
    expect(runOne).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'T1' }));
  });

  it('runs the orchestrator when --plan is set', async () => {
    await Run.run(['--plan=my-plan']);

    expect(Orchestrator).toHaveBeenCalledWith(expect.objectContaining({ planSlug: 'my-plan' }));
    expect(mockOrchestratorRun).toHaveBeenCalledTimes(1);
  });

  it('exposes --with-architect and --no-architect flags', () => {
    const flags = (Run as unknown as { flags: Record<string, unknown> }).flags;
    expect(flags['with-architect']).toBeDefined();
    expect(flags['no-architect']).toBeDefined();
  });

  it('errors when both --with-architect and --no-architect are set', async () => {
    await expect(Run.run(['--plan', 'x', '--with-architect', '--no-architect'])).rejects.toThrow(
      /mutually exclusive/i,
    );
  });

  it('passes withArchitect=true to Orchestrator when --with-architect is set', async () => {
    vi.mocked(Orchestrator).mockClear();
    await Run.run(['--plan=p', '--with-architect']);
    expect(Orchestrator).toHaveBeenCalledWith(expect.objectContaining({ withArchitect: true }));
  });

  it('passes noArchitect=true to Orchestrator when --no-architect is set', async () => {
    vi.mocked(Orchestrator).mockClear();
    await Run.run(['--plan=p', '--no-architect']);
    expect(Orchestrator).toHaveBeenCalledWith(expect.objectContaining({ noArchitect: true }));
  });
});
