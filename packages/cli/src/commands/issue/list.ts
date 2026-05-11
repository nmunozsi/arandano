import { Command, Flags } from '@oclif/core';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';

export default class IssueList extends Command {
  static override description = 'List issues under planning/issues/';
  static override flags = {
    status: Flags.string({ description: 'filter by status (open | closed)' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(IssueList);
    const issueDir = join(process.cwd(), 'planning', 'issues');
    let entries: string[];
    try {
      entries = await readdir(issueDir);
    } catch {
      this.log('no issues directory found');
      return;
    }
    const mdFiles = entries.filter((e) => e.endsWith('.md'));
    if (mdFiles.length === 0) {
      this.log('no issues found');
      return;
    }
    for (const file of mdFiles.sort()) {
      const content = await readFile(join(issueDir, file), 'utf8');
      const { data } = matter(content);
      const status = (data as { status?: string }).status ?? 'unknown';
      if (flags.status && status !== flags.status) continue;
      const title = (data as { title?: string }).title ?? file;
      const labels = ((data as { labels?: string[] }).labels ?? []).join(', ');
      this.log(`[${status}] ${title}${labels ? ' (' + labels + ')' : ''} — ${file}`);
    }
  }
}
