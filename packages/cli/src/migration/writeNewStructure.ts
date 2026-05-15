import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { locationHeader, type SiblingEntry } from './locationHeader.js';
import type { ParsedPhasePlan } from './parsePhasePlan.js';

export interface WriteOpts {
  repoRoot: string;
  destRelPath: string;
  parsed: ParsedPhasePlan;
  mode: 'plan' | 'phase';
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // strip parens like "(TDD)"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export async function writeNewStructure(opts: WriteOpts): Promise<void> {
  const fullDest = join(opts.repoRoot, opts.destRelPath);
  await mkdir(fullDest, { recursive: true });

  const overviewName = opts.mode === 'plan' ? 'plan.md' : 'phase.md';
  const taskFiles = opts.parsed.tasks.map((t) => ({
    name: `T${t.number}-${kebab(t.title)}.md`,
    task: t,
  }));

  const siblingsFor = (currentName: string): SiblingEntry[] => {
    const all: SiblingEntry[] = [
      { name: overviewName, isCurrent: overviewName === currentName, isDir: false },
      ...taskFiles.map((tf) => ({
        name: tf.name,
        isCurrent: tf.name === currentName,
        isDir: false,
      })),
    ];
    return all;
  };

  // Overview file
  const overviewHeader = locationHeader({
    fullPath: `${opts.destRelPath}/${overviewName}`,
    siblings: siblingsFor(overviewName),
  });
  const checklist = taskFiles
    .map((tf) => `- [ ] [T${tf.task.number} — ${tf.task.title}](${tf.name})`)
    .join('\n');
  const overviewBody = [
    opts.parsed.preamble,
    '',
    '## Tasks',
    '',
    checklist,
    '',
    ...(opts.parsed.exitCriteria
      ? ['---', '', '## Exit criteria', '', opts.parsed.exitCriteria]
      : []),
  ].join('\n');
  await writeFile(join(fullDest, overviewName), overviewHeader + overviewBody, 'utf8');

  // Per-task files
  for (const tf of taskFiles) {
    const header = locationHeader({
      fullPath: `${opts.destRelPath}/${tf.name}`,
      siblings: siblingsFor(tf.name),
    });
    await writeFile(join(fullDest, tf.name), header + tf.task.body + '\n', 'utf8');
  }
}
