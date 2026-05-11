import { Args, Command, Flags } from '@oclif/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export default class IssueOpen extends Command {
  static override description = 'Create a new issue MD under planning/issues/';
  static override args = { slug: Args.string({ required: true }) };
  static override flags = {
    title: Flags.string({ required: true }),
    labels: Flags.string({ description: 'comma-separated' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IssueOpen);
    const today = new Date().toISOString().slice(0, 10);
    const fname = `${today}-${args.slug}.md`;
    const path = join(process.cwd(), 'planning', 'issues', fname);
    await mkdir(join(process.cwd(), 'planning', 'issues'), { recursive: true });
    const labels =
      flags.labels
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    await writeFile(
      path,
      [
        `---`,
        `title: "${flags.title}"`,
        `status: open`,
        `labels: [${labels.join(', ')}]`,
        `---`,
        ``,
        `## What`,
        ``,
        `## Repro`,
        ``,
        `## Expected`,
        ``,
      ].join('\n'),
      'utf8',
    );
    this.log(`opened ${path}`);
  }
}
