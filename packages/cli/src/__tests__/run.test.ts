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

vi.mock('@arandano/core', async (orig) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const real = (await orig()) as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...real,
    runOne: vi.fn(() => Promise.resolve({ exitCode: 0, reason: 'ok' })),
  };
});

import Run from '../commands/run.js';
import { runOne } from '@arandano/core';

describe('arandano run', () => {
  it('calls runOne with the task id', async () => {
    await Run.run(['T1']);
    expect(runOne).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'T1' }));
  });
});
