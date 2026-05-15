import { Command } from '@oclif/core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

export default class Doctor extends Command {
  static override description = 'Verify Docker, gh, and repo state.';

  async run(): Promise<void> {
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
    const root = process.cwd();

    checks.push(
      await tryCheck('docker available', () =>
        exec('docker', ['version', '--format', '{{.Server.Version}}']),
      ),
    );
    checks.push(await tryCheck('gh authenticated', () => exec('gh', ['auth', 'status'])));
    checks.push(
      await tryCheck('config.yaml present', async () => {
        await readFile(join(root, '.arandano', 'config.yaml'), 'utf8');
      }),
    );
    checks.push(
      await tryCheck('git working tree clean', async () => {
        const { stdout } = await exec('git', ['status', '--porcelain'], { cwd: root });
        if (stdout.trim()) throw new Error('dirty');
      }),
    );

    for (const c of checks) {
      this.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    }
    if (checks.some((c) => !c.ok)) process.exit(1);
  }
}

async function tryCheck<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ name: string; ok: boolean; detail?: string }> {
  try {
    await fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message };
  }
}
