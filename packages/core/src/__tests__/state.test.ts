import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { rm, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../state/store.js';
import type { RunState } from '../types/state.js';

describe('StateStore', () => {
  const tmpDir = join(tmpdir(), `arandano-test-${Math.random().toString(36).slice(2)}`);
  const stateFile = join(tmpDir, '.arandano/state.json');
  let store: StateStore;

  beforeEach(async () => {
    await mkdir(tmpDir, { recursive: true });
    store = new StateStore(stateFile);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('initializes with empty state if file does not exist', async () => {
    const state = await store.read();
    expect(state).toEqual({ tasks: {} });
  });

  it('updates and writes state atomically', async () => {
    await store.update((state) => {
      state.tasks['task-1'] = {
        status: 'pending',
        retry_count: 0,
      };
    });

    const content = await readFile(stateFile, 'utf-8');
    const state = JSON.parse(content) as RunState;
    expect(state.tasks['task-1']!.status).toBe('pending');
  });

  it('handles multiple concurrent updates safely (atomic write)', async () => {
    // This tests the writeAtomic by ensuring that multiple writes don't corrupt the JSON
    // Although actual locking is not implemented, the rename approach prevents partial writes.
    const updates = Array.from({ length: 10 }).map((_, i) =>
      store.update((state) => {
        state.tasks[`task-${i}`] = { status: 'completed', retry_count: 0 };
      }),
    );

    await Promise.all(updates);
    const state = await store.read();
    expect(Object.keys(state.tasks)).toHaveLength(10);
  });
});
