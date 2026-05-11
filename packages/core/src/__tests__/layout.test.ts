import { describe, expect, it } from 'vitest';
import { runFolder, runArtifacts } from '../runs/layout.js';

describe('runFolder', () => {
  it('formats a deterministic folder name', () => {
    const date = new Date('2026-05-08T19:30:00Z');
    expect(runFolder({ taskId: 'T3', date })).toBe('2026-05-08T19-30Z-T3');
  });
});

describe('runArtifacts', () => {
  it('builds journal/result/review paths under .arandano/runs/<folder>', () => {
    const a = runArtifacts({ projectRoot: '/repo', folder: '2026-05-08T19-30Z-T3' });
    expect(a.journal).toBe('/repo/.arandano/runs/2026-05-08T19-30Z-T3/journal.md');
    expect(a.result).toBe('/repo/.arandano/runs/2026-05-08T19-30Z-T3/result.json');
    expect(a.review).toBe('/repo/.arandano/runs/2026-05-08T19-30Z-T3/review.md');
    expect(a.dir).toBe('/repo/.arandano/runs/2026-05-08T19-30Z-T3');
  });
});
