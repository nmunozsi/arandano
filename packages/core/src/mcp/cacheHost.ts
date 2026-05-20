import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFileAsync } from './_exec.js';

export const PINNED_GITNEXUS_VERSION = '1.6.5';

export type CacheResult = 'cache-hit' | 'rebuilt' | 'skipped' | 'failed';

const STAMP_REL_PATH = '.gitnexus/.head-stamp';
const ANALYZE_TIMEOUT_MS = 5 * 60_000;

export interface EnsureOpts {
  log?: (line: string) => void;
}

// shell:true required on Windows — npm installs a .cmd wrapper, not an .exe
const EXEC_OPTS = process.platform === 'win32' ? { shell: true as const } : {};

async function gitnexusOnHost(): Promise<boolean> {
  try {
    await execFileAsync('gitnexus', ['--version'], EXEC_OPTS);
    return true;
  } catch {
    return false;
  }
}

async function currentHead(workspaceRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function readStamp(workspaceRoot: string): Promise<string | null> {
  const p = join(workspaceRoot, STAMP_REL_PATH);
  if (!existsSync(p)) return null;
  try {
    return (await readFile(p, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function writeStamp(workspaceRoot: string, head: string): Promise<void> {
  const p = join(workspaceRoot, STAMP_REL_PATH);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, head, 'utf8');
}

async function deleteStamp(workspaceRoot: string): Promise<void> {
  await rm(join(workspaceRoot, STAMP_REL_PATH), { force: true });
}

export async function ensureGitnexusCacheHost(
  workspaceRoot: string,
  opts: EnsureOpts = {},
): Promise<CacheResult> {
  const log = opts.log ?? (() => {});

  if (!(await gitnexusOnHost())) {
    log(
      `gitnexus: skipped (not installed on host — run \`npm install -g gitnexus@${PINNED_GITNEXUS_VERSION}\`)`,
    );
    return 'skipped';
  }

  const head = await currentHead(workspaceRoot);
  if (!head) {
    log(`gitnexus: skipped (not a git repo at ${workspaceRoot})`);
    return 'skipped';
  }

  const stamp = await readStamp(workspaceRoot);
  if (stamp === head) {
    log(`gitnexus: cache-hit (${head.slice(0, 8)})`);
    return 'cache-hit';
  }

  try {
    await execFileAsync('gitnexus', ['analyze'], {
      cwd: workspaceRoot,
      timeout: ANALYZE_TIMEOUT_MS,
      ...EXEC_OPTS,
    });
    await writeStamp(workspaceRoot, head);
    log(`gitnexus: rebuilt (${head.slice(0, 8)})`);
    return 'rebuilt';
  } catch (e) {
    await deleteStamp(workspaceRoot);
    log(`gitnexus: failed (${(e as Error).message.slice(0, 200)})`);
    return 'failed';
  }
}
