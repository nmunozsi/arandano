import { describe, expect, it } from 'vitest';
import { synthesizeReviewerTask } from '../synthesizeReviewerTask.js';
import type { TaskFrontmatter } from '../../types/task.js';

const coder: TaskFrontmatter = {
  id: 'T1',
  title: 'add greet',
  role: 'coder',
  quality: { reviewer_required: true },
};

describe('synthesizeReviewerTask', () => {
  it('produces a T1-review task that depends on T1', () => {
    const r = synthesizeReviewerTask({ source: coder, prUrl: 'https://gh/x/y/pull/1' });
    expect(r?.id).toBe('T1-review');
    expect(r?.role).toBe('reviewer');
    expect(r?.depends_on).toEqual(['T1']);
    expect(r?.title).toContain('Review T1');
  });

  it('returns null when reviewer_required is false', () => {
    const cf: TaskFrontmatter = { ...coder, quality: { reviewer_required: false } };
    expect(synthesizeReviewerTask({ source: cf, prUrl: 'x' })).toBeNull();
  });

  it('returns null when quality is not set', () => {
    const cf: TaskFrontmatter = { id: coder.id, title: coder.title, role: coder.role };
    expect(synthesizeReviewerTask({ source: cf, prUrl: 'x' })).toBeNull();
  });
});
