> **Location:** `docs/gitnexus-context/plans/v1-architect/T7-build-and-verify.md`
>
> **Folder structure:**
>
> ```
> v1-architect/
> ├── plan.md
> ├── T1-synthesize-architect-mcp.md
> ├── T2-containerspec-forward-mcp.md
> ├── T3-orchestrator-prewarm-and-doctor.md
> ├── T4-worker-dockerfile-gitnexus.md
> ├── T5-worker-mcp-helpers.md
> ├── T6-architect-driver-wire-mcp.md
> └── T7-build-and-verify.md                      ← you are here
> ```

# T7 — Build worker, push to GHCR, manual smoke verification

**Repos:** `arandano` (monorepo), `arandano-worker`, `arandano-examples/node-ts-toy`

**Files:**

- Modify (example): `arandano-examples/node-ts-toy/.gitignore` (add `.gitnexus/` and `.claude/`)
- Modify (monorepo): `README.md` (document `npm install -g gitnexus@<PINNED>` host prerequisite)
- Modify (monorepo): plan files in `docs/gitnexus-context/plans/v1-architect/` (check off boxes)
- No source changes — this task pushes prior commits and triggers the GHCR release workflow.

**Context:** Tasks T1–T6 are unit-tested but produce no user-visible behavior on their own. T7 is the e2e validation: install gitnexus on the host, push the worker source, wait for `release.yml` in `nmunozsi/arandano-worker` to publish `ghcr.io/nmunozsi/arandano-worker:latest`, then run `arandano run --plan=<slug> --with-architect` against `node-ts-toy` and verify:

- (a) the orchestrator pre-warms the cache (`gitnexus: rebuilt` on first run; `cache-hit` on second);
- (b) the worker verifies the cache successfully (`gitnexus: cache-hit` in journal);
- (c) Claude reaches the MCP server (gitnexus tool calls in transcript);
- (d) the architect run completes successfully.

Per project rules: **never `docker push` manually** — the GitHub Actions workflow owns the GHCR push.

**Prerequisite:** T1, T2, T3 merged to arandano `main`; T4, T5, T6 committed in `arandano-worker` (push happens in this task).

---

- [ ] **Step 1: Install pinned gitnexus on the host**

```
# Match the version pinned in packages/core/src/mcp/cacheHost.ts and arandano-worker/Dockerfile.
npm install -g gitnexus@<PINNED_VERSION>
gitnexus --version
```

Expected: prints `<PINNED_VERSION>`. If npm resolved to a different version, force the install to fix it before proceeding.

- [ ] **Step 2: Verify `arandano doctor` reports gitnexus as ok**

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" doctor
```

Expected: one of the lines reads `ok    gitnexus available (advisory)`. Exit code 0.

Now temporarily simulate the missing-install case to verify the advisory:

```
# Renames the binary on PATH temporarily (do this only locally; restore right after)
# Example for Windows PowerShell:
$gn = (Get-Command gitnexus).Source
Rename-Item $gn "$gn.hidden"
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" doctor
# Expected: `warn  gitnexus available (advisory) — ...`, exit code 0 (NOT 1).
Rename-Item "$gn.hidden" $gn
```

If `arandano doctor` exits non-zero in the "advisory missing" run, the `advisory: true` flag isn't reaching the exit logic — fix in T3 and re-run.

- [ ] **Step 3: Add gitignore entries in node-ts-toy**

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy
```

Append to `.gitignore`:

```
.gitnexus/
.claude/
```

If `.gitnexus/` or `.claude/` already exist in the working tree from a prior experiment, delete them now:

```
rm -rf .gitnexus .claude
```

Commit + push:

```
git add .gitignore
git commit -m ":wrench: chore: ignore .gitnexus/ and .claude/ produced by worker MCP wiring"
git push
```

- [ ] **Step 4: Update arandano README with the host prerequisite**

Add (or extend) a "Prerequisites" section in `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\README.md`. The new bullet describes GitNexus as an optional recommended dependency, includes the pinned install command, and notes that `arandano doctor` will warn when it's missing.

Suggested content (adapt to match the README's existing tone):

> **Optional (recommended): GitNexus** — enables in-container code-graph context for the architect role. Install with `npm install -g gitnexus@<PINNED_VERSION>` (substituting the version pinned in `packages/core/src/mcp/cacheHost.ts`). Without it, `arandano run` still works, but the architect runs without graph context and `arandano doctor` will warn you.

Commit (locally; will push as part of Step 12):

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add README.md
git commit -m ":memo: docs: document optional gitnexus host install for architect graph context"
```

- [ ] **Step 5: Push the worker commits to trigger the GHCR release**

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
git push
```

- [ ] **Step 6: Watch the release workflow**

```
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 3
gh run watch --repo nmunozsi/arandano-worker
```

Expected: build succeeds; image published to `ghcr.io/nmunozsi/arandano-worker:latest`. Confirm the build log shows the pinned `gitnexus --version` (Dockerfile sanity step).

- [ ] **Step 7: Pull the new image and confirm in-container**

```
docker pull ghcr.io/nmunozsi/arandano-worker:latest
docker run --rm --user 1001:1001 ghcr.io/nmunozsi/arandano-worker:latest gitnexus --version
```

Expected: prints `<PINNED_VERSION>` matching the host install from Step 1.

- [ ] **Step 8: First smoke run (expect orchestrator "rebuilt", worker "cache-hit")**

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples\node-ts-toy
# Ensure no stale cache
rm -rf .gitnexus .claude
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan <smoke-plan-slug> --with-architect
```

Replace `<smoke-plan-slug>` with an existing tiny plan in node-ts-toy that has at least one coder task so the architect has something to refresh against.

Required env vars (per CLAUDE.md): `ANTHROPIC_API_KEY`, `GH_TOKEN` (with `repo` scope).

**Watch for:**

1. **Orchestrator stderr** (before the first task dispatches): `gitnexus: rebuilt (<sha8>)`.
2. **Worker journal** (architect task): `gitnexus: cache-hit`.
3. **Claude output** in the architect run includes at least one MCP tool invocation referencing gitnexus (smoke signal that the registry-poke + stdio MCP server connected).
4. **PR opens normally** (or `architect: no-op` if the diff is empty — both valid).

**Troubleshooting:**

- Orchestrator says `gitnexus: rebuilt` but worker says `gitnexus: missing`: the bind-mount isn't carrying `.gitnexus/` through. Check the workspace path in containerSpec; verify `.gitnexus/` exists on host after step 1.
- Worker says `gitnexus: cache-hit` but Claude makes no MCP tool calls: the registry-poke or `--mcp-config` path isn't connecting. Inspect `.claude/mcp.json` (should not be cleaned up); inspect `~/.gitnexus/registry.json` if you used the non-no-op registry path; look at the container's stdout for MCP connection errors.
- Orchestrator says `gitnexus: failed`: the host's `gitnexus analyze` errored. Run it manually in the workspace (`cd node-ts-toy && gitnexus analyze`) to see the actual error. Most likely cause: an unsupported language file in the repo (shouldn't happen with node-ts-toy's TS-only contents).

- [ ] **Step 9: Second smoke run (expect "cache-hit" twice)**

Without deleting `.gitnexus/`:

```
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan <smoke-plan-slug> --with-architect
```

**Watch for:**

1. Orchestrator stderr: `gitnexus: cache-hit (<sha8>)`.
2. Worker journal: `gitnexus: cache-hit`.

This confirms the HEAD-stamp short-circuit works on both sides.

- [ ] **Step 10: Degraded-path smoke (host gitnexus missing)**

Temporarily rename the host gitnexus binary (same `Rename-Item` from Step 2), then:

```
rm -rf .gitnexus .claude
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan <smoke-plan-slug> --with-architect
```

**Watch for:**

1. Orchestrator stderr: `gitnexus: skipped (not installed on host — ...)`.
2. Worker journal: `gitnexus: missing` (no cache because orchestrator skipped).
3. **The architect run still completes** — PR opens or `architect: no-op` is logged.

Restore the host gitnexus binary when done.

- [ ] **Step 11: Check off the plan files and commit**

Update `docs/gitnexus-context/plans/v1-architect/plan.md` — flip every task checkbox to `[x]`. Update each `T*.md` similarly. Commit in the monorepo:

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano
git add docs/gitnexus-context/
git commit -m ":memo: docs(plans): mark gitnexus-context v1 complete"
```

- [ ] **Step 12: Open the PR(s)**

- **arandano-worker:** if you used a feature branch (instead of pushing direct to `main`), open the PR now. Otherwise the workflow has already shipped the image.
- **arandano:** push the current branch and open a PR titled `:sparkles: feat: gitnexus MCP context for architect (v1)`. Reference this plan in the body. The README + plan + monorepo source changes ride together.
- `arandano-examples/node-ts-toy`: the gitignore commit can land directly on its `main` branch (single-user example repo).

- [ ] **Step 13: (Optional) Open follow-up issues**

Track anything the smoke run surfaced. Out-of-scope candidates already named in the spec:

- Retry-with-backoff on host analyze failures.
- Telemetry on cache hit rate in `result.json`.
- `arandano init` template additions for `.gitnexus/` / `.claude/` gitignore entries.
- Cleanup of leaked `gitnexus mcp` child processes if claude exits uncleanly.
- Concurrency lock on `.gitnexus/.head-stamp` for parallel `arandano run` invocations against the same repo.
