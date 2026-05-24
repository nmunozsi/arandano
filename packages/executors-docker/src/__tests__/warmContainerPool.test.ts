import { describe, it, expect, vi } from 'vitest';
import { WarmContainerPool } from '../warmContainerPool.js';
import type { WarmContainerPoolOpts } from '../warmContainerPool.js';

const makeFakeClient = () => {
  const containers: { id: string; running: boolean }[] = [];
  let counter = 0;
  return {
    pull: vi.fn().mockResolvedValue(undefined),
    createContainer: vi.fn(() => {
      counter++;
      const c = { id: `c${counter}`, running: true };
      containers.push(c);
      return Promise.resolve({
        id: c.id,
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(() => {
          c.running = false;
          return Promise.resolve();
        }),
        remove: vi.fn(() => {
          containers.splice(containers.indexOf(c), 1);
          return Promise.resolve();
        }),
        exec: vi.fn(() =>
          Promise.resolve({
            start: vi.fn(),
            inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
          }),
        ),
      });
    }),
    containers: () => containers,
  };
};

type FakeClient = ReturnType<typeof makeFakeClient>;

function makePool(client: FakeClient, poolDir: string, maxSlots: number): WarmContainerPool {
  const cloneProject = vi.fn((_src: string, _dst: string, _remote: string) => Promise.resolve());
  const opts: WarmContainerPoolOpts = {
    client: client as unknown as WarmContainerPoolOpts['client'],
    cloneProject,
    poolDir,
    maxSlots,
  };
  return new WarmContainerPool(opts);
}

describe('WarmContainerPool', () => {
  it('first acquire is cold; release returns slot; second acquire on same image is warm', async () => {
    const client = makeFakeClient();
    const pool = makePool(client, '/tmp/arandano-pool-test', 2);

    const a = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    expect(a.isWarm).toBe(false);
    expect(client.createContainer).toHaveBeenCalledTimes(1);
    await pool.release({ slotId: a.slotId, resetOk: true });

    const b = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    expect(b.isWarm).toBe(true);
    expect(b.containerId).toBe(a.containerId);
    expect(client.createContainer).toHaveBeenCalledTimes(1); // not recreated
  });

  it('reset failure destroys the container and next acquire is cold', async () => {
    const client = makeFakeClient();
    const pool = makePool(client, '/tmp/arandano-pool-test2', 2);

    const a = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    await pool.release({ slotId: a.slotId, resetOk: false });
    const b = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    expect(b.isWarm).toBe(false);
    expect(b.containerId).not.toBe(a.containerId);
  });

  it('maxSlots caps the pool; surplus acquires create+destroy without warming', async () => {
    const client = makeFakeClient();
    const pool = makePool(client, '/tmp/arandano-pool-test3', 1);

    const a = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    const b = await pool.acquire({
      image: 'img:1',
      projectRoot: '/proj',
      buildSpec: () => ({
        Image: 'img:1',
        WorkingDir: '/workspace',
        User: '1001:1001',
        Env: [],
        HostConfig: { Binds: [], AutoRemove: false },
      }),
    });
    // b had no slot available; pool returns isWarm=false with a transient container that won't be retained
    expect(b.isWarm).toBe(false);
    await pool.release({ slotId: a.slotId, resetOk: true });
    await pool.release({ slotId: b.slotId, resetOk: true });
    // slot is freed; transient container destroyed
  });
});
