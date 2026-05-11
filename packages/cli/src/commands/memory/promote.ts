import { Args, Command, Flags } from '@oclif/core';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export default class MemoryPromote extends Command {
  static override description =
    'Append a finding from a run journal to planning/memory/coding-standards.md';

  static override args = {
    runFolder: Args.string({ required: true, description: 'e.g. 2026-05-08T19-30Z-T1' }),
  };

  static override flags = {
    section: Flags.string({ required: true }),
    rule: Flags.string({ required: true }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MemoryPromote);
    const root = process.cwd();
    const journal = await readFile(
      join(root, '.arandano', 'runs', args.runFolder, 'journal.md'),
      'utf8',
    );
    const today = new Date().toISOString().slice(0, 10);
    const block = [
      ``,
      `### ${flags.section} (${today}, from run ${args.runFolder})`,
      ``,
      `**Rule:** ${flags.rule}`,
      ``,
      `**Source excerpt:**`,
      ``,
      '```',
      journal.slice(0, 800),
      '```',
      ``,
    ].join('\n');
    await appendFile(join(root, 'planning', 'memory', 'coding-standards.md'), block, 'utf8');
    this.log(`appended to planning/memory/coding-standards.md`);
  }
}
