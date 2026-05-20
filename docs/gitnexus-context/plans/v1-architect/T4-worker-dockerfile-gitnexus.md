> **Location:** `docs/gitnexus-context/plans/v1-architect/T4-worker-dockerfile-gitnexus.md`
>
> **Folder structure:**
>
> ```
> v1-architect/
> ├── plan.md
> ├── T1-synthesize-architect-mcp.md
> ├── T2-containerspec-forward-mcp.md
> ├── T3-orchestrator-prewarm-and-doctor.md
> ├── T4-worker-dockerfile-gitnexus.md            ← you are here
> ├── T5-worker-mcp-helpers.md
> ├── T6-architect-driver-wire-mcp.md
> └── T7-build-and-verify.md
> ```

# T4 — Worker Dockerfile installs gitnexus CLI (pinned version)

**Repo:** `arandano-worker` (`C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker`)

**Files:**

- Modify: `Dockerfile`

**Context:** GitNexus's MCP server (`gitnexus mcp`) is stdio-only and runs as a child process of Claude Code inside the worker container. The worker doesn't analyze (that happens on the host in T3) — but it still needs the `gitnexus` binary to serve `mcp`. Install the same pinned version T3 used on the host so on-disk schemas agree.

**Pinned version:** Use the exact same version string T3 used in `packages/core/src/mcp/cacheHost.ts` (`PINNED_GITNEXUS_VERSION`). Confirm before starting:

```
grep PINNED_GITNEXUS_VERSION C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\core\src\mcp\cacheHost.ts
```

**Prerequisite:** T3 must be merged so the pinned version is established.

---

- [ ] **Step 1: Inspect the current Dockerfile**

```
cat Dockerfile
```

Locate the layer that installs Node-global tooling (typically before the `USER worker` directive). All `RUN npm install -g` lines run as root.

- [ ] **Step 2: Add the gitnexus install + smoke layer**

Insert these two `RUN` instructions immediately before the `USER worker` directive (or whichever directive switches off root):

```dockerfile
# GitNexus — code-graph MCP server (PolyForm Noncommercial).
# Pinned to match the host-installed version in arandano/packages/core/src/mcp/cacheHost.ts.
# Used in-container only as a stdio MCP server (`gitnexus mcp`); analysis happens on the host.
RUN npm install -g gitnexus@<PINNED_VERSION>
RUN gitnexus --version
```

Replace `<PINNED_VERSION>` with the exact version from `PINNED_GITNEXUS_VERSION` in the monorepo.

The second line is a build-time sanity check: if the binary doesn't resolve or fails to invoke, the image build fails immediately rather than producing a silently-broken image.

- [ ] **Step 3: Build the image locally to verify**

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
docker build -t arandano-worker:local-gitnexus-smoke -f Dockerfile .
```

Expected: build succeeds. The `gitnexus --version` step prints the pinned version to the build log. **Verify the printed version matches `<PINNED_VERSION>`** — if npm resolved to a different version (e.g. through caching), the pin isn't holding and we have a problem.

- [ ] **Step 4: Sanity-run the binary as the worker user**

```
docker run --rm --user 1001:1001 arandano-worker:local-gitnexus-smoke gitnexus --version
```

Expected: prints the pinned version, exit code 0. Confirms PATH is correct for UID 1001 and the install isn't root-only.

- [ ] **Step 5: Run the existing worker test suite (sanity)**

```
cd lib && npm test
```

Expected: existing tests pass. (No code-level changes yet — sanity check.)

- [ ] **Step 6: Commit**

```
cd C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker
git add Dockerfile
git commit -m ":wrench: chore(worker): install gitnexus CLI for in-container stdio MCP (pinned)"
```

**Do not push yet.** T5 and T6 land first, then T7 pushes everything together so the GHCR release workflow rebuilds once with the full feature.
