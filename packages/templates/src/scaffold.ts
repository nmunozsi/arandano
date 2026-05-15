import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globby } from 'globby';

export interface ScaffoldOpts {
  stack: 'node-ts' | 'python' | 'go';
  targetDir: string;
  name: string;
  license: string;
  workerImage: string;
  contactEmail: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const STACKS_ROOT = join(HERE, '..', 'stacks');

function interpolate(text: string, opts: ScaffoldOpts): string {
  return text
    .replaceAll('{{name}}', opts.name)
    .replaceAll('{{license}}', opts.license)
    .replaceAll('{{worker_image}}', opts.workerImage)
    .replaceAll('{{contact_email}}', opts.contactEmail);
}

export async function scaffold(opts: ScaffoldOpts): Promise<void> {
  const src = join(STACKS_ROOT, opts.stack);
  const existing = await safeReaddir(opts.targetDir);
  if (existing.length > 0) {
    throw new Error(`target directory is not empty: ${opts.targetDir}`);
  }

  const files = await globby(['**/*', '**/.*', '**/.*/**'], {
    cwd: src,
    dot: true,
    onlyFiles: true,
  });

  for (const rel of files) {
    const from = join(src, rel);
    const isTpl = rel.endsWith('.tpl');
    const toRel = isTpl ? rel.slice(0, -4) : rel;
    const to = join(opts.targetDir, toRel);
    await mkdir(dirname(to), { recursive: true });
    if (isTpl) {
      const text = await readFile(from, 'utf8');
      await writeFile(to, interpolate(text, opts), 'utf8');
    } else {
      await copyFile(from, to);
    }
  }
}

async function safeReaddir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}
