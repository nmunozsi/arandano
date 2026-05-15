import { describe, expect, it } from 'vitest';
import { selectReadyBatch, validateDag } from '../dag.js';
import type { TaskFrontmatter } from '../../types/task.js';

const tf = (id: string, deps: string[] = []): TaskFrontmatter => ({
  id,
  title: id,
  role: 'coder',
  depends_on: deps,
});

describe('validateDag', () => {
  it('passes a clean DAG', () => {
    expect(() => validateDag([tf('T1'), tf('T2', ['T1']), tf('T3', ['T1'])])).not.toThrow();
  });
  it('throws on cycle', () => {
    expect(() => validateDag([tf('T1', ['T2']), tf('T2', ['T1'])])).toThrow(/cycle/);
  });
  it('throws on missing dependency', () => {
    expect(() => validateDag([tf('T2', ['T_GHOST'])])).toThrow(/T_GHOST/);
  });
});

describe('selectReadyBatch', () => {
  it('selects all root tasks initially', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2'), tf('T3', ['T1'])],
      state: { tasks: {} },
      maxParallel: 5,
    });
    expect(batch.sort()).toEqual(['T1', 'T2']);
  });

  it('caps at maxParallel', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2'), tf('T3'), tf('T4')],
      state: { tasks: {} },
      maxParallel: 2,
    });
    expect(batch.length).toBe(2);
  });

  it('does not include tasks already running or completed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2')],
      state: {
        tasks: {
          T1: { status: 'running', retry_count: 0 },
          T2: { status: 'completed', retry_count: 0 },
        },
      },
      maxParallel: 5,
    });
    expect(batch).toEqual([]);
  });

  it('unblocks a task once its deps are completed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2', ['T1'])],
      state: { tasks: { T1: { status: 'completed', retry_count: 0 } } },
      maxParallel: 5,
    });
    expect(batch).toEqual(['T2']);
  });

  it('stops a task whose dependency failed', () => {
    const batch = selectReadyBatch({
      tasks: [tf('T1'), tf('T2', ['T1'])],
      state: { tasks: { T1: { status: 'failed', retry_count: 0 } } },
      maxParallel: 5,
    });
    expect(batch).toEqual([]);
  });
});
