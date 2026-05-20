import type { Executor, ExitResult, Handle, TaskRun } from '@arandano/core';
import { runArtifacts, runFolder } from '@arandano/core';
import { buildContainerSpec } from './containerSpec.js';
import { defaultClient, type DockerClient } from './client.js';
import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);

export type CloneProjectFn = (src: string, dst: string, remoteUrl: string) => Promise<void>;

export interface DockerExecutorOpts {
  image: string;
  projectRoot: string;
  client?: DockerClient;
  hostEnv?: Record<string, string | undefined>;
  now?: () => Date;
  cloneProject?: CloneProjectFn;
}

type Container = Awaited<ReturnType<DockerClient['createContainer']>>;

export class DockerExecutor implements Executor {
  private readonly running = new Map<
    string,
    { containerId: string; container: Container; folder: string; cloneDir: string }
  >();
  private readonly opts: DockerExecutorOpts;

  constructor(opts: DockerExecutorOpts) {
    this.opts = {
      client: defaultClient(),
      hostEnv: process.env as Record<string, string | undefined>,
      now: () => new Date(),
      cloneProject: defaultCloneProject,
      ...opts,
    };
  }

  async start(task: TaskRun): Promise<Handle> {
    const folder = runFolder({ taskId: task.taskId, date: this.opts.now!() });

    // Create a local clone of the project so each parallel task has its own
    // .git directory — eliminates the HEAD race when two containers share the
    // same workspace bind-mount.
    const cloneDir = join(tmpdir(), `arandano-task-${task.taskId}-${Date.now()}`);
    let remoteUrl = '';
    try {
      const { stdout } = await exec('git', ['remote', 'get-url', 'origin'], {
        cwd: this.opts.projectRoot,
      });
      remoteUrl = stdout.trim();
    } catch {
      // no remote configured — local-only repo, clone still works
    }
    await this.opts.cloneProject!(this.opts.projectRoot, cloneDir, remoteUrl);
    // Carry gitignored MCP cache into the clone so the worker can verify it.
    await cp(join(this.opts.projectRoot, '.gitnexus'), join(cloneDir, '.gitnexus'), {
      recursive: true,
    }).catch(() => {});

    const spec = buildContainerSpec({
      task,
      image: this.opts.image,
      projectRoot: cloneDir,
      runFolder: folder,
      hostEnv: this.opts.hostEnv!,
    });
    await this.opts.client!.pull(this.opts.image);
    const container = await this.opts.client!.createContainer(spec as unknown);
    await container.start();
    const id = `${task.taskId}::${container.id}`;
    this.running.set(id, { containerId: container.id, container, folder, cloneDir });
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

      // Copy the run folder from the task clone back to the main project directory
      // so the orchestrator and arandano status can find result.json / journal.md.
      const cloneRunDir = join(entry.cloneDir, '.arandano', 'runs', entry.folder);
      const mainRunDir = join(this.opts.projectRoot, '.arandano', 'runs', entry.folder);
      await cp(cloneRunDir, mainRunDir, { recursive: true }).catch(() => {});

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
      await rm(entry.cloneDir, { recursive: true, force: true }).catch(() => {});
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

async function defaultCloneProject(src: string, dst: string, remoteUrl: string): Promise<void> {
  await exec('git', ['clone', '--local', '--no-single-branch', src, dst]);
  if (remoteUrl) {
    await exec('git', ['remote', 'set-url', 'origin', remoteUrl], { cwd: dst });
  }
}
