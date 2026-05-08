import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
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

    try {
      await writeFile(tempPath, content, 'utf-8');
      await rename(tempPath, this.filePath);
    } catch (error) {
      // Cleanup temp file if it exists and write failed
      try {
        await rename(tempPath, tempPath + '.failed'); // Or just leave it for debugging, but rename ensures it doesn't conflict
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}
