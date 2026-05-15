> **Location:** `docs/initial-build/plans/v1-rollout/phase-7-auto-planner-skill/T4-inject-the-skill-into-the-worker-image.md`
>
> **Folder structure:**
>
> ```
> phase-7-auto-planner-skill/
> ├── phase.md
> ├── T1-author-the-skill-markdown.md
> ├── T2-validate-task-tree-helper.md
> ├── T3-arandano-plan-decompose-plan-md-command.md
> ├── T4-inject-the-skill-into-the-worker-image.md           ← you are here
> └── T5-end-to-end-smoke.md
> ```

### Task 4: Inject the skill into the worker image

**Goal:** The worker image needs to know where to find the skill. Two options:

- **A:** Bake the `@arandano/skills` package into the worker image at build time (clone-and-symlink under `/home/worker/.claude/plugins/arandano-skills/`).
- **B:** Mount it in at runtime from the project's `node_modules/@arandano/skills/skills/`.

Pick A for portability — every worker has the skills regardless of project state.

**Files:**

- Modify: `arandano-worker/Dockerfile`
- Modify: `arandano-worker/.github/workflows/release.yml` to invalidate cache when skill content changes (already cache-busts on full repo)

- [ ] **Step 1: Update the Dockerfile**

```dockerfile
# After the superpowers clone:
RUN git clone --depth=1 https://github.com/nmunozsi/arandano.git /tmp/arandano \
 && mkdir -p /home/worker/.claude/plugins/arandano-skills/skills \
 && cp -r /tmp/arandano/packages/skills/skills/* /home/worker/.claude/plugins/arandano-skills/skills/ \
 && rm -rf /tmp/arandano
```

(Or COPY a tarball produced by the CI of the `arandano` repo. Pinning a specific commit avoids drift; for v1 we accept "latest main" with the understanding that `arandano-worker` is rebuilt on every `arandano` release.)

- [ ] **Step 2: Add a smoke test inside the worker image**

In `arandano-worker/lib/src/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

describe('worker image bundles arandano skills', () => {
  it('has decomposing-plan-into-tasks/SKILL.md', () => {
    // Skip when not running inside the image.
    const p =
      '/home/worker/.claude/plugins/arandano-skills/skills/decomposing-plan-into-tasks/SKILL.md';
    if (!existsSync('/home/worker/.claude/plugins/arandano-skills')) return;
    expect(existsSync(p)).toBe(true);
  });
});
```

- [ ] **Step 3: Build, push, commit**

```bash
docker build -t arandano-worker:dev .
git add Dockerfile lib/
git commit -m "feat: bake arandano skills into worker image"
```

---
