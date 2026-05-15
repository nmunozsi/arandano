import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold } from '../scaffold.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arandano-scaffold-'));
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
});

describe('scaffold', () => {
  it('copies the node-ts template tree to the target dir', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'my-app',
      license: 'MIT',
      workerImage: 'ghcr.io/nmunozsi/arandano-worker:0.0.0',
      contactEmail: 'me@example.com',
    });

    expect((await stat(join(dir, 'AGENTS.md'))).isFile()).toBe(true);
    expect((await stat(join(dir, '.prettierrc.json'))).isFile()).toBe(true);
    expect((await stat(join(dir, 'src', 'CONTEXT.md'))).isFile()).toBe(true);
    expect((await stat(join(dir, '.arandano', 'config.yaml'))).isFile()).toBe(true);
  });

  it('interpolates {{name}} into AGENTS.md', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'my-app',
      license: 'MIT',
      workerImage: 'x',
      contactEmail: 'y',
    });
    const text = await readFile(join(dir, 'AGENTS.md'), 'utf8');
    expect(text).toContain('# my-app');
  });

  it('interpolates {{worker_image}} into .arandano/config.yaml', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'my-app',
      license: 'MIT',
      workerImage: 'ghcr.io/x/y:1.2.3',
      contactEmail: 'y',
    });
    const text = await readFile(join(dir, '.arandano', 'config.yaml'), 'utf8');
    expect(text).toContain('image: ghcr.io/x/y:1.2.3');
  });

  it('strips the .tpl suffix from interpolated files', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'a',
      license: 'MIT',
      workerImage: 'x',
      contactEmail: 'y',
    });
    await expect(stat(join(dir, '.gitignore'))).resolves.toBeDefined();
    await expect(stat(join(dir, '.gitignore.tpl'))).rejects.toThrow();
  });

  it('node-ts ships the new gitmoji commitlint pack', async () => {
    await scaffold({
      stack: 'node-ts',
      targetDir: dir,
      name: 'demo',
      license: 'MIT',
      workerImage: 'x',
      contactEmail: 'a@b',
    });
    const txt = await readFile(join(dir, '.commitlintrc.cjs'), 'utf8');
    expect(txt).toContain('@arandano/templates/commitlint-rules');
  });

  it('refuses to overwrite a non-empty target dir', async () => {
    await import('node:fs/promises').then((m) => m.writeFile(join(dir, 'preexisting.txt'), 'hi'));
    await expect(
      scaffold({
        stack: 'node-ts',
        targetDir: dir,
        name: 'a',
        license: 'MIT',
        workerImage: 'x',
        contactEmail: 'y',
      }),
    ).rejects.toThrow(/not empty/);
  });
});
