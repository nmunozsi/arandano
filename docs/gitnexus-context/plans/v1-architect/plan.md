> **Location:** `docs/gitnexus-context/plans/v1-architect/plan.md`
>
> **Folder structure:**
>
> ```
> v1-architect/
> ├── plan.md                                       ← you are here
> ├── T1-synthesize-architect-mcp.md
> ├── T2-containerspec-forward-mcp.md
> ├── T3-orchestrator-prewarm-and-doctor.md
> ├── T4-worker-dockerfile-gitnexus.md
> ├── T5-worker-mcp-helpers.md
> ├── T6-architect-driver-wire-mcp.md
> └── T7-build-and-verify.md
> ```

# GitNexus context — v1 (architect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake GitNexus into the worker image, pre-warm the cache from the orchestrator (host) before any task dispatches, and wire `gitnexus mcp` as a stdio MCP server for the synthetic `T-architect` task — so Claude has live code-graph queries available during architecture refreshes, without paying analyze cost inside the worker.

**Architecture:** Seven ordered tasks across two repos. Tasks 1–3 are in the arandano monorepo (`packages/core`, `packages/executors-docker`, `packages/cli`). Tasks 4–6 are in `arandano-worker`. Task 7 builds the image via the existing GHCR release workflow and verifies end-to-end on `node-ts-toy`. Each task is independently committable and leaves the system in a working state.

**Tech Stack:** TypeScript / Node 22, Vitest (tests), `node:fs/promises` (I/O), `node:child_process` (host shell-outs for `gitnexus analyze` and `git rev-parse`), Docker / GHCR (worker image), [GitNexus](https://github.com/abhigyanpatwari/GitNexus) (PolyForm Noncommercial), Tree-sitter (transitive).

---

## Tasks

- [ ] [T1 — Synthesized architect task carries `mcp: ['gitnexus']`](T1-synthesize-architect-mcp.md)
- [ ] [T2 — containerSpec forwards `mcpServers` as `ARANDANO_MCP_SERVERS` env var](T2-containerspec-forward-mcp.md)
- [ ] [T3 — Orchestrator host-side cache pre-warm + `arandano doctor` advisory check](T3-orchestrator-prewarm-and-doctor.md)
- [ ] [T4 — Worker Dockerfile installs gitnexus CLI (pinned version)](T4-worker-dockerfile-gitnexus.md)
- [ ] [T5 — Worker MCP helpers module (verify + registry + config)](T5-worker-mcp-helpers.md)
- [ ] [T6 — Architect driver wires MCP into invokeCli](T6-architect-driver-wire-mcp.md)
- [ ] [T7 — Build worker, push to GHCR, manual smoke verification](T7-build-and-verify.md)

## Cross-task invariants

- All commit messages use `:emoji: type(scope): subject` (project commitlint rule pack, mirrored to the worker via gitmoji-commits skill).
- No changes to existing TaskFrontmatter / TaskRun type signatures — the `mcp` / `mcpServers` slots already exist; we only fill in consumers.
- After T2 (before T3), `ARANDANO_MCP_SERVERS` is in the container env for the architect task but no consumer reads it yet — that's intentional.
- After T3 (before T4–T6), the orchestrator pre-warms the cache on the host, but the worker doesn't yet know how to consume `.gitnexus/`. The pre-warm runs harmlessly; the architect run still works with no graph context.
- After T4 (worker has gitnexus binary, helpers/wiring not yet present), the binary sits unused in the image — also intentional, smallest reviewable steps.
- After T6 (before T7), local tests pass but the published image still lacks gitnexus; the architect run will hit the worker's "binary missing → skipped" graceful path.
- T7 is the only task that produces user-visible behavior end-to-end; everything before it is plumbing with passing unit tests.

## Pinned GitNexus version

Throughout T3, T4, T5, T6, T7 use the same pinned version string. **Choose the version when starting T3** (latest stable at execution time; record it in T3's commit message), then use the same value in `arandano/README.md`, `packages/core/src/mcp/cacheHost.ts`, and `arandano-worker/Dockerfile`. The README and Dockerfile lines must read `gitnexus@<PINNED_VERSION>` so a future bump is a one-line change in each file.
