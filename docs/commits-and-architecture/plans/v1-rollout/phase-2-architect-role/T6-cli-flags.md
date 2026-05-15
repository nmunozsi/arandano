> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T6-cli-flags.md`

---

id: T6
title: --with-architect / --no-architect CLI flags
role: coder
tdd: strict
depends_on: [T5]

---

# T6 — CLI flags pipe through to Orchestrator

**Files:**

- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/__tests__/run.test.ts` (extend existing tests or create the file)

**Why:** Expose the new Orchestrator options on the CLI surface with a mutual-exclusivity check.

---

- [ ] **Step 1: Write the failing test**

If `packages/cli/src/__tests__/run.test.ts` doesn't exist yet, create it:

```ts
import { describe, expect, it } from 'vitest';
import Run from '../commands/run.js';

describe('arandano run flags', () => {
  it('exposes --with-architect and --no-architect', () => {
    const flags = (Run as unknown as { flags: Record<string, unknown> }).flags;
    expect(flags['with-architect']).toBeDefined();
    expect(flags['no-architect']).toBeDefined();
  });

  it('errors when both --with-architect and --no-architect are set', async () => {
    const cmd = new Run(
      ['--plan', 'x', '--with-architect', '--no-architect'],
      // @ts-expect-error — minimal Config stub
      {},
    );
    await expect(cmd.run()).rejects.toThrow(/mutually exclusive/i);
  });

  it('single-task runs do not pass --with-architect into runOne', async () => {
    // Single-task path skips Orchestrator entirely and calls runOne directly,
    // so architect synthesis is impossible. Verify by reading the source
    // — runOne signature does NOT accept withArchitect/noArchitect.
    const src = (await import('node:fs')).readFileSync('packages/cli/src/commands/run.ts', 'utf8');
    const singleTaskBranch = src.split('if (!args.taskId)')[1] ?? '';
    expect(singleTaskBranch).not.toMatch(/withArchitect/);
    expect(singleTaskBranch).not.toMatch(/noArchitect/);
  });
});
```

- [ ] **Step 2: Run the test — should fail**

```bash
npm test --workspace=@arandano/cli -- -t "arandano run flags"
```

Expected: FAIL.

- [ ] **Step 3: Add the flags and the check**

Edit `packages/cli/src/commands/run.ts`:

```diff
   static override flags = {
     plan: Flags.string({ description: 'plan slug under .arandano/specs/<spec>/plans/<slug>/' }),
     spec: Flags.string({ description: 'spec name (disambiguates ambiguous plan slugs)' }),
     phase: Flags.string({ description: 'phase slug to run a single phase of a multi-phase plan' }),
+    'with-architect': Flags.boolean({
+      description: 'force the architect task to run even when disabled in config or in a phase run',
+    }),
+    'no-architect': Flags.boolean({
+      description: 'suppress the architect task even when enabled in config',
+    }),
   };
```

In the `async run()` body, after `const { args, flags } = await this.parse(Run);`:

```diff
+    if (flags['with-architect'] && flags['no-architect']) {
+      throw new Error('--with-architect and --no-architect are mutually exclusive');
+    }
```

And when constructing the Orchestrator:

```diff
       const o = new Orchestrator({
         projectRoot,
         planSlug: flags.plan,
         executor,
         ...(flags.spec !== undefined && { specName: flags.spec }),
         ...(flags.phase !== undefined && { phaseSlug: flags.phase }),
+        withArchitect: flags['with-architect'] === true,
+        noArchitect: flags['no-architect'] === true,
       });
```

- [ ] **Step 4: Re-run the test**

```bash
npm test --workspace=@arandano/cli -- -t "arandano run flags"
```

Expected: PASS.

- [ ] **Step 5: Update the oclif manifest**

The oclif command surface changed. Regenerate the manifest if the repo has a build step that does so (check `packages/cli/package.json` scripts):

```bash
npm run --workspace=@arandano/cli build
```

Inspect `packages/cli/oclif.manifest.json` (if present) to confirm the two new flags appear. If a separate `npm run oclif:manifest` exists, run that.

- [ ] **Step 6: Smoke-test the CLI surface**

```bash
node "packages/cli/dist/bin.js" run --help
```

Expected: the help output lists `--with-architect` and `--no-architect` with the descriptions above.

```bash
node "packages/cli/dist/bin.js" run --plan demo --with-architect --no-architect
```

Expected: exits non-zero with "mutually exclusive" message.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/run.ts \
        packages/cli/src/__tests__/run.test.ts \
        packages/cli/oclif.manifest.json
git commit -m ":sparkles: feat(cli): --with-architect and --no-architect flags"
```

## Acceptance

- Help output includes both flags
- Passing both yields a clear error before the Orchestrator is constructed
- Flags reach the Orchestrator and override the config default as designed in T4/T5
- All tests pass
