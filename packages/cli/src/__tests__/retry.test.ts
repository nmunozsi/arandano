import { describe, expect, it, vi } from 'vitest';

const mockRead = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@arandano/core', async (orig) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const real = (await orig()) as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...real,
    StateStore: vi.fn(() => ({ read: mockRead, update: mockUpdate })),
  };
});

// Node fs readFile mock so oclif config doesn't fail when it reads package.json
vi.mock('node:fs/promises', async (orig) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const real = (await orig()) as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return real;
});

import Retry from '../commands/retry.js';

describe('arandano retry', () => {
  it('resets a failed task to pending', async () => {
    mockRead.mockResolvedValueOnce({
      tasks: { T1: { status: 'failed', retry_count: 0 } },
    });
    mockUpdate.mockImplementation(
      (
        updater: (s: {
          tasks: Record<string, { status: string; retry_count: number; error?: string }>;
        }) => void,
      ) => {
        const s = { tasks: { T1: { status: 'failed', retry_count: 0 } } };
        updater(s);
        return Promise.resolve(s);
      },
    );
    await Retry.run(['T1']);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('throws if task is not in failed state', async () => {
    mockRead.mockResolvedValueOnce({
      tasks: { T2: { status: 'completed', retry_count: 0 } },
    });
    await expect(Retry.run(['T2'])).rejects.toThrow(/completed/);
  });
});
