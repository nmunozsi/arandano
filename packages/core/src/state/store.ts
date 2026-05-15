import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RunState } from '../types/state.js';

export class StateStore {
  private lock: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<RunState> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as RunState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { tasks: {} };
      }
      throw error;
    }
  }

  async update(updater: (state: RunState) => void | Promise<void>): Promise<RunState> {
    const release = await this.acquireLock();
    try {
      const state = await this.read();
      await updater(state);
      await this.writeAtomic(state);
      return state;
    } finally {
      release();
    }
  }

  private async acquireLock(): Promise<() => void> {
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const currentLock = this.lock;
    this.lock = nextLock;
    await currentLock;
    return release!;
  }

  private async writeAtomic(state: RunState): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const tempPath = `${this.filePath}.${Math.random().toString(36).slice(2)}.tmp`;
    const content = JSON.stringify(state, null, 2);

    await writeFile(tempPath, content, 'utf-8');
    try {
      await rename(tempPath, this.filePath);
    } catch (e) {
      // Windows: rename over an existing file can fail with EPERM when
      // another handle is open; fall back to direct write (lock serialises
      // within-process writes so this is safe).
      if ((e as NodeJS.ErrnoException).code === 'EPERM') {
        await writeFile(this.filePath, content, 'utf-8');
        await unlink(tempPath).catch(() => {});
      } else {
        await unlink(tempPath).catch(() => {});
        throw e;
      }
    }
  }
}
