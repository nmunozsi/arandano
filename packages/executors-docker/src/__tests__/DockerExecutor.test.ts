import { describe, it, expect } from 'vitest';
import { DockerExecutor } from '../DockerExecutor.js';
import type { TaskRun } from '@arandano/core';

describe('DockerExecutor', () => {
  it('implements Executor interface with Phase 1 stubs', async () => {
    const executor = new DockerExecutor();

    expect(typeof executor.start).toBe('function');
    expect(typeof executor.wait).toBe('function');
    expect(typeof executor.logs).toBe('function');
    expect(typeof executor.cancel).toBe('function');

    // @ts-expect-error - execute should be removed
    expect(executor.execute).toBeUndefined();

    await expect(executor.start({ taskId: 'test' } as unknown as TaskRun)).rejects.toThrow(
      'DockerExecutor.start: not implemented (Phase 1)',
    );
  });
});
