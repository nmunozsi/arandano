import { describe, expect, it, vi } from 'vitest';

const mockRead = vi.fn();

vi.mock('@arandano/core', async (orig) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const real = (await orig()) as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...real,
    StateStore: vi.fn(() => ({ read: mockRead })),
  };
});

import Status from '../commands/status.js';

describe('arandano status', () => {
  it('prints task statuses from state.json', async () => {
    mockRead.mockResolvedValueOnce({
      tasks: { T1: { status: 'completed', retry_count: 0, branch: 'agent/T1-x' } },
    });
    const logs: string[] = [];
    const cmd = new Status([], {} as never);
    cmd.log = (m?: unknown) => {
      logs.push(String(m));
    };
    await cmd.run();
    const joined = logs.join('\n');
    expect(joined).toContain('T1');
    expect(joined).toContain('completed');
  });

  it('handles empty state', async () => {
    mockRead.mockResolvedValueOnce({ tasks: {} });
    const logs: string[] = [];
    const cmd = new Status([], {} as never);
    cmd.log = (m?: unknown) => {
      logs.push(String(m));
    };
    await cmd.run();
    expect(logs.join('\n')).toContain('no tasks');
  });
});
