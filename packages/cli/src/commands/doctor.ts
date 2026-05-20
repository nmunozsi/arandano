import { Command } from '@oclif/core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  advisory?: boolean;
}

export default class Doctor extends Command {
  static override description = 'Verify Docker, gh, and repo state.';

  async run(): Promise<void> {
    const checks: CheckResult[] = [];
    const root = process.cwd();

    checks.push(
      await tryCheck('docker available', () =>
        exec('docker', ['version', '--format', '{{.Server.Version}}']),
      ),
    );
    checks.push(await tryCheck('gh authenticated', () => exec('gh', ['auth', 'status'])));
    checks.push(
      await tryCheck(
        'gitnexus available (advisory)',
        // shell:true required on Windows where npm installs a .cmd wrapper, not an .exe
        () => exec('gitnexus', ['--version'], { shell: true }),
        { advisory: true },
      ),
    );
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
      const tag = c.ok ? 'ok  ' : c.advisory ? 'warn' : 'FAIL';
      this.log(`${tag}  ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    }
    if (checks.some((c) => !c.ok && !c.advisory)) process.exit(1);
  }
}

async function tryCheck<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { advisory?: boolean } = {},
): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: true, ...(opts.advisory ? { advisory: true } : {}) };
  } catch (e) {
    return {
      name,
      ok: false,
      detail: (e as Error).message,
      ...(opts.advisory ? { advisory: true } : {}),
    };
  }
}
