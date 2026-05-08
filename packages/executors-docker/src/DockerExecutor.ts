import type { Executor, Handle, ExitResult, TaskRun } from '@arandano/core';

export class DockerExecutor implements Executor {
  // eslint-disable-next-line @typescript-eslint/require-await
  async start(_task: TaskRun): Promise<Handle> {
    throw new Error('DockerExecutor.start: not implemented (Phase 1)');
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async wait(_h: Handle, _opts?: { timeoutMs: number }): Promise<ExitResult> {
    throw new Error('DockerExecutor.wait: not implemented (Phase 1)');
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async *logs(_h: Handle, _opts?: { follow: boolean }): AsyncIterable<string> {
    throw new Error('DockerExecutor.logs: not implemented (Phase 1)');
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async cancel(_h: Handle): Promise<void> {
    throw new Error('DockerExecutor.cancel: not implemented (Phase 1)');
  }
}
