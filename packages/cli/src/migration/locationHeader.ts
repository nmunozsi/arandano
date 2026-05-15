import { dirname, basename } from 'node:path';

export interface SiblingEntry {
  name: string;
  isCurrent: boolean;
  isDir: boolean;
}

export interface LocationOpts {
  fullPath: string; // relative to repo root, forward slashes
  siblings: SiblingEntry[]; // entries in the parent folder, in display order
}

function displayName(s: SiblingEntry): string {
  if (s.isDir && !s.name.endsWith('/')) return s.name + '/';
  return s.name;
}

export function locationHeader(opts: LocationOpts): string {
  const parent = basename(dirname(opts.fullPath.replaceAll('\\', '/'))) + '/';
  const maxLen = Math.max(...opts.siblings.map((s) => displayName(s).length));
  // Pad to maxLen + 10 so "← you are here" is clearly separated from the name
  const padWidth = maxLen + 10;

  const lines: string[] = [];
  lines.push(`> **Location:** \`${opts.fullPath.replaceAll('\\', '/')}\``);
  lines.push('>');
  lines.push('> **Folder structure:**');
  lines.push('>');
  lines.push('> ```');
  lines.push(`> ${parent}`);
  opts.siblings.forEach((s, i) => {
    const last = i === opts.siblings.length - 1;
    const branch = last ? '└──' : '├──';
    const display = displayName(s);
    const marker = s.isCurrent ? `${display.padEnd(padWidth)}← you are here` : display;
    lines.push(`> ${branch} ${marker}`);
  });
  lines.push('> ```');
  lines.push('');
  return lines.join('\n') + '\n';
}
