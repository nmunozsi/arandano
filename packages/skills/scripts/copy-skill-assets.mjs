import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join('src', 'skills');
const DEST = join('dist', 'skills');

if (!existsSync(SRC)) process.exit(0);

for (const skillName of readdirSync(SRC)) {
  const srcDir = join(SRC, skillName);
  if (!statSync(srcDir).isDirectory()) continue;
  const destDir = join(DEST, skillName);
  mkdirSync(destDir, { recursive: true });
  for (const file of readdirSync(srcDir)) {
    copyFileSync(join(srcDir, file), join(destDir, file));
  }
}
