import { Command, Flags } from '@oclif/core';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export default class Cleanup extends Command {
  static override description = 'Remove run artifacts and merged agent branches.';
  static override flags = {
    dry: Flags.boolean({ description: 'print what would be removed but do not delete' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Cleanup);
    const root = process.cwd();
    const runs = join(root, '.arandano', 'runs');
    if (flags.dry) this.log(`would remove ${runs}`);
    else await rm(runs, { recursive: true, force: true });

    const { stdout } = await exec('git', ['branch', '--list', 'agent/*'], { cwd: root });
    const branches = stdout
      .split('\n')
      .map((s) => s.trim().replace(/^\* /, ''))
      .filter(Boolean);
    for (const b of branches) {
      const merged = await exec('git', ['merge-base', '--is-ancestor', b, 'main'], { cwd: root })
        .then(() => true)
        .catch(() => false);
      if (!merged) continue;
      if (flags.dry) this.log(`would delete branch ${b}`);
      else await exec('git', ['branch', '-d', b], { cwd: root });
    }
  }
}
