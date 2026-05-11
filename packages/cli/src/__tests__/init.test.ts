import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Init from '../commands/init.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-init-'));
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
});

describe('arandano init', () => {
  it('scaffolds a node-ts project in the target dir', async () => {
    await Init.run([
      '--stack=node-ts',
      '--name=my-app',
      `--target=${dir}`,
      '--worker-image=ghcr.io/nmunozsi/arandano-worker:0.0.0',
    ]);
    expect((await stat(join(dir, 'AGENTS.md'))).isFile()).toBe(true);
    expect((await stat(join(dir, '.arandano', 'config.yaml'))).isFile()).toBe(true);
  });

  it('rejects an unsupported stack', async () => {
    await expect(
      Init.run(['--stack=cobol', '--name=x', `--target=${dir}`, '--worker-image=x']),
    ).rejects.toThrow(/stack/);
  });
});
