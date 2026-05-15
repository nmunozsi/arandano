import { Args, Command } from '@oclif/core';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export default class IssueClose extends Command {
  static override description = 'Close an issue by slug or filename.';
  static override args = {
    slug: Args.string({ required: true, description: 'issue slug or filename' }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(IssueClose);
    const issueDir = join(process.cwd(), 'planning', 'issues');
    // Accept a bare slug (prepend today's date) or full filename
    const filename = args.slug.endsWith('.md') ? args.slug : undefined;
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(issueDir);
    const match = filename
      ? entries.find((e) => e === filename)
      : entries.find((e) => e.includes(args.slug));
    if (!match) throw new Error(`no issue found matching: ${args.slug}`);
    const path = join(issueDir, match);
    const content = await readFile(path, 'utf8');
    await writeFile(path, content.replace('status: open', 'status: closed'), 'utf8');
    this.log(`closed ${path}`);
  }
}
