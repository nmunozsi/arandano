import type { Executor, ExitResult, Handle, TaskRun } from '@arandano/core';
import { runArtifacts, runFolder } from '@arandano/core';
import { buildContainerSpec } from './containerSpec.js';
import { defaultClient, type DockerClient } from './client.js';

export interface DockerExecutorOpts {
  image: string;
  projectRoot: string;
  client?: DockerClient;
  hostEnv?: Record<string, string | undefined>;
  now?: () => Date;
}

type Container = Awaited<ReturnType<DockerClient['createContainer']>>;

export class DockerExecutor implements Executor {
  private readonly running = new Map<
    string,
    { containerId: string; container: Container; folder: string }
  >();
  private readonly opts: DockerExecutorOpts;

  constructor(opts: DockerExecutorOpts) {
    this.opts = {
      client: defaultClient(),
      hostEnv: process.env as Record<string, string | undefined>,
      now: () => new Date(),
      ...opts,
    };
  }

  async start(task: TaskRun): Promise<Handle> {
    const folder = runFolder({ taskId: task.taskId, date: this.opts.now!() });
    const spec = buildContainerSpec({
      task,
      image: this.opts.image,
      projectRoot: this.opts.projectRoot,
      runFolder: folder,
      hostEnv: this.opts.hostEnv!,
    });
    await this.opts.client!.pull(this.opts.image);
    const container = await this.opts.client!.createContainer(spec as unknown);
    await container.start();
    const id = `${task.taskId}::${container.id}`;
    this.running.set(id, { containerId: container.id, container, folder });
    // Stream container logs live to host stdout (Docker multiplex: 8-byte header + payload)
    void container
      .logs({ stdout: true, stderr: true, follow: true })
      .then((stream) => {
        stream.on('data', (chunk: Buffer) => {
          if (chunk.length > 8) process.stdout.write(chunk.subarray(8));
        });
      })
      .catch(() => {});
    return { id };
  }

  async wait(h: Handle, opts?: { timeoutMs: number }): Promise<ExitResult> {
    const entry = this.running.get(h.id);
    if (!entry) throw new Error(`unknown handle: ${h.id}`);
    const timer = opts?.timeoutMs
      ? setTimeout(() => {
          void entry.container.stop({ t: 5 });
        }, opts.timeoutMs)
      : null;
    try {
      const { StatusCode } = await entry.container.wait();
      const artifacts = runArtifacts({ projectRoot: this.opts.projectRoot, folder: entry.folder });
      const reason = StatusCode === 0 ? 'ok' : 'error';
      return {
        exitCode: StatusCode,
        reason,
        resultJsonPath: artifacts.result,
        journalPath: artifacts.journal,
      };
    } finally {
      if (timer) clearTimeout(timer);
      await entry.container.remove({ force: true }).catch(() => {});
      this.running.delete(h.id);
    }
  }

  async *logs(h: Handle, opts?: { follow: boolean }): AsyncIterable<string> {
    const entry = this.running.get(h.id);
    if (!entry) throw new Error(`unknown handle: ${h.id}`);
    const stream = await entry.container.logs({
      stdout: true,
      stderr: true,
      follow: opts?.follow ?? false,
    });
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      yield chunk.toString('utf8');
    }
  }

  async cancel(h: Handle): Promise<void> {
    const entry = this.running.get(h.id);
    if (!entry) return;
    await entry.container.stop({ t: 5 }).catch(() => {});
  }
}
