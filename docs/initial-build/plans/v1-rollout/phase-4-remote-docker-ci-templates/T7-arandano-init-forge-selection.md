> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/T7-arandano-init-forge-selection.md`
>
> **Folder structure:**
>
> ```
> phase-4-remote-docker-ci-templates/
> ├── phase.md
> ├── T1-parse-the-docker-host-url.md
> ├── T2-wire-parsedockerhost-into-the-dockerode-client-fac.md
> ├── T3-setup-guide-local-laptop-driving-homelab-docker.md
> ├── T4-github-actions-templates-per-stack.md
> ├── T5-forgejo-actions-templates.md
> ├── T6-gitlab-ci-templates.md
> ├── T7-arandano-init-forge-selection.md                               ← you are here
> └── T8-end-to-end-smoke-against-the-real-homelab.md
> ```

### Task 7: `arandano init --forge=<...>` selection

**Goal:** The `init` command now accepts `--forge=github|forgejo|gitlab` and copies only the matching workflow files (omitting the others).

**Files:**

- Modify: `packages/templates/src/scaffold.ts`
- Modify: `packages/cli/src/commands/init.ts`
- Modify: tests

- [ ] **Step 1: Extend `ScaffoldOpts` with `forge`**

```ts
export interface ScaffoldOpts {
  stack: 'node-ts' | 'python' | 'go';
  forge: 'github' | 'forgejo' | 'gitlab' | 'none';
  // ... rest unchanged
}
```

- [ ] **Step 2: Skip workflow files for non-selected forges**

Inside `scaffold()`, before copying each file:

```ts
const FORGE_PATHS: Record<string, string[]> = {
  github: ['.github/workflows/'],
  forgejo: ['.forgejo/workflows/'],
  gitlab: ['.gitlab-ci.yml'],
};
function shouldSkipForForge(rel: string, selectedForge: string): boolean {
  for (const [forge, prefixes] of Object.entries(FORGE_PATHS)) {
    if (forge === selectedForge) continue;
    for (const p of prefixes) {
      if (rel.startsWith(p)) return true;
    }
  }
  return false;
}
```

In the file-copy loop, `if (shouldSkipForForge(rel, opts.forge)) continue;`.

- [ ] **Step 3: Tests**

In `scaffold.test.ts`, add:

```ts
it('omits forgejo and gitlab files when forge=github', async () => {
  await scaffold({ /* ... */ forge: 'github' });
  await expect(stat(join(dir, '.github', 'workflows', 'ci.yml'))).resolves.toBeDefined();
  await expect(stat(join(dir, '.forgejo'))).rejects.toThrow();
  await expect(stat(join(dir, '.gitlab-ci.yml'))).rejects.toThrow();
});

it('omits github and gitlab files when forge=forgejo', async () => {
  /* ... */
});
it('omits github and forgejo when forge=gitlab', async () => {
  /* ... */
});
```

- [ ] **Step 4: Update `init.ts`**

Add the flag:

```ts
'forge': Flags.string({ default: 'github', options: ['github', 'forgejo', 'gitlab', 'none'] }),
```

Forward it to `scaffold()`.

- [ ] **Step 5: Run tests, commit**

```bash
npm test
git add packages/templates/ packages/cli/
git commit -m "feat(cli): arandano init --forge selects per-forge CI workflow"
```

---
