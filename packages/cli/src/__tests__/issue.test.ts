import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-issue-'));
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('arandano issue open', () => {
  it('creates issue md with correct frontmatter', async () => {
    const { default: IssueOpen } = await import('../commands/issue/open.js');
    await IssueOpen.run(['my-bug', '--title=My Bug Title', '--labels=bug,ui']);
    const today = new Date().toISOString().slice(0, 10);
    const content = await readFile(join(dir, 'planning', 'issues', `${today}-my-bug.md`), 'utf8');
    expect(content).toContain('title: "My Bug Title"');
    expect(content).toContain('status: open');
    expect(content).toContain('bug');
    expect(content).toContain('ui');
  });

  it('creates issue without labels', async () => {
    const { default: IssueOpen } = await import('../commands/issue/open.js');
    await IssueOpen.run(['no-labels', '--title=Plain Issue']);
    const today = new Date().toISOString().slice(0, 10);
    const content = await readFile(
      join(dir, 'planning', 'issues', `${today}-no-labels.md`),
      'utf8',
    );
    expect(content).toContain('status: open');
    expect(content).toContain('labels: []');
  });
});

describe('arandano issue close', () => {
  it('flips status to closed on a matching issue', async () => {
    const { default: IssueOpen } = await import('../commands/issue/open.js');
    const { default: IssueClose } = await import('../commands/issue/close.js');
    await IssueOpen.run(['the-bug', '--title=The Bug']);
    const today = new Date().toISOString().slice(0, 10);
    await IssueClose.run([`${today}-the-bug.md`]);
    const content = await readFile(join(dir, 'planning', 'issues', `${today}-the-bug.md`), 'utf8');
    expect(content).toContain('status: closed');
    expect(content).not.toContain('status: open');
  });

  it('throws if slug not found', async () => {
    const { default: IssueClose } = await import('../commands/issue/close.js');
    await expect(IssueClose.run(['nonexistent'])).rejects.toThrow();
  });
});

describe('arandano issue list', () => {
  it('lists open issues', async () => {
    const { default: IssueOpen } = await import('../commands/issue/open.js');
    const { default: IssueList } = await import('../commands/issue/list.js');
    await IssueOpen.run(['first', '--title=First Issue', '--labels=bug']);
    await IssueOpen.run(['second', '--title=Second Issue']);
    const logs: string[] = [];
    const logSpy = vi.spyOn(IssueList.prototype, 'log').mockImplementation((m?: unknown) => {
      logs.push(String(m));
    });
    await IssueList.run([]);
    logSpy.mockRestore();
    const joined = logs.join('\n');
    expect(joined).toContain('First Issue');
    expect(joined).toContain('Second Issue');
    expect(joined).toContain('[open]');
  });

  it('filters by status', async () => {
    const { default: IssueOpen } = await import('../commands/issue/open.js');
    const { default: IssueClose } = await import('../commands/issue/close.js');
    const { default: IssueList } = await import('../commands/issue/list.js');
    await IssueOpen.run(['open-issue', '--title=Open One']);
    await IssueOpen.run(['closed-issue', '--title=Closed One']);
    const today = new Date().toISOString().slice(0, 10);
    await IssueClose.run([`${today}-closed-issue.md`]);
    const logs: string[] = [];
    const logSpy = vi.spyOn(IssueList.prototype, 'log').mockImplementation((m?: unknown) => {
      logs.push(String(m));
    });
    await IssueList.run(['--status=open']);
    logSpy.mockRestore();
    const joined = logs.join('\n');
    expect(joined).toContain('Open One');
    expect(joined).not.toContain('Closed One');
  });
});
