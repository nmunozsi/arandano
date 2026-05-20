import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export { SUPPORTED_STACKS, isSupportedStack } from './stacks.js';
export { scaffold } from './scaffold.js';
export type { ScaffoldOpts } from './scaffold.js';
export type { Stack } from '@arandano/core';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ARCHITECTURE_TEMPLATE_PATH = join(HERE, '..', 'assets', 'architecture.md.tpl');

export async function readArchitectureTemplate(name: string): Promise<string> {
  const text = await readFile(ARCHITECTURE_TEMPLATE_PATH, 'utf8');
  return text.replaceAll('{{name}}', name);
}
