> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/phase.md`
>
> **Folder structure:**
>
> ```
> phase-4-remote-docker-ci-templates/
> ├── phase.md                                                          ← you are here
> ├── T1-parse-the-docker-host-url.md
> ├── T2-wire-parsedockerhost-into-the-dockerode-client-fac.md
> ├── T3-setup-guide-local-laptop-driving-homelab-docker.md
> ├── T4-github-actions-templates-per-stack.md
> ├── T5-forgejo-actions-templates.md
> ├── T6-gitlab-ci-templates.md
> ├── T7-arandano-init-forge-selection.md
> └── T8-end-to-end-smoke-against-the-real-homelab.md
> ```

# arandano Phase 4 — Remote Homelab Docker + CI Workflow Templates Implementation Plan

> **Updated 2026-05-11 after Phase 1 landed.** See "Phase 1 reality check" below before executing — Task 4 is rescoped (node-ts CI already exists) and `client.ts` is modified (not created).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the orchestrator dispatch tasks to a remote Docker daemon over SSH, so a developer's laptop can drive workers running on the homelab Ubuntu/Docker-Compose box. Ship CI workflow templates per forge (GitHub Actions, Forgejo Actions, GitLab CI) selectable at `arandano init` time. Add a setup guide that walks a brand-new user from "fresh laptop + fresh homelab" to a green PR.

**Architecture:** dockerode supports `Host` + ssh agent forwarding via `DOCKER_HOST=ssh://user@host`. We pass the URL through from `executor.docker.host` in config to the dockerode constructor. The CLI grows `arandano init --forge=<github|forgejo|gitlab>` which selects which CI workflow file to copy. A new `docs/setup-guide.md` documents the full path.

**Tech Stack:** Adds `ssh2` (transitively from dockerode) for the SSH transport. Adds workflow templates per forge.

**Reference spec:** `arandano-design.md` §13.1 (`executor.docker.host`), §15.4 (CI templates), §24 Phase 4.

**Scope deferrals:**

- K8s executor — Phase 5.
- Daemon mode — Phase 6.

---

## Phase 1 reality check (2026-05-11)

Phase 1 shipped `executors-docker/src/client.ts` with `defaultClient()` and the node-ts CI workflow at `packages/templates/stacks/node-ts/.github/workflows/ci.yml`. This rescopes some tasks.

**Phase 1 surfaces this plan touches:**

- `defaultClient()` — `packages/executors-docker/src/client.ts`:
  ```ts
  export interface DockerClient { createContainer(opts: unknown): Promise<...> }
  export function defaultClient(): DockerClient { const d = new Docker(); return d as unknown as DockerClient; }
  ```
  Task 2 **modifies** this file to honor `parseDockerHost`; it doesn't create a new client module.
- Init command — `packages/cli/src/commands/init.ts` — uses `Flags.string({ required: true })` style (oclif 4). The flag list as of Phase 1: `--stack`, `--name`, `--target`, `--worker-image`, `--license`, `--contact-email`. Task 7 adds `--forge` here.
- Existing node-ts CI — `packages/templates/stacks/node-ts/.github/workflows/ci.yml` already exists. Task 4 audits/refines this, doesn't create.
- CLI exit-code idiom: `process.exit(code)` (not `this.exit(code)`).

**Per-task corrections:**

- **Task 2** (wire `parseDockerHost` into client factory): the existing `defaultClient()` calls `new Docker()` (no args). Modify to `new Docker(parseDockerHost(host))`. The `host` arg must thread through: `DockerExecutorOpts` → `defaultClient(host?)` → `parseDockerHost(host)`. Check `DockerExecutor.ts` constructor — currently it calls `defaultClient()` with no args; that line needs the host argument added.
- **Task 4** (GitHub Actions templates): rescope. The node-ts GHA template **already exists** at `packages/templates/stacks/node-ts/.github/workflows/ci.yml` (shipped in Phase 1 Task 1). Audit it for: (a) caching `node_modules`, (b) running all 7 gates in order, (c) matrix on Node 22. **Only python and go GHA templates are net-new in this phase** (and those depend on Phase 2 Tasks 10/11 having shipped python/go scaffolds first).
- **Task 7** (`--forge` flag): use `Flags.string({ options: ['github', 'forgejo', 'gitlab'], default: 'github' })`. The init command currently writes the whole stack tree unconditionally; you'll need to either (a) move forge-specific files under `stacks/<stack>/.forge/<github|forgejo|gitlab>/` and copy only the selected one, or (b) post-scaffold-prune the unselected forge directories. Approach (a) is cleaner and matches the `.tpl` convention's spirit.
- **All new commands/extensions**: use `process.exit(code)` for non-zero exits, not `this.exit(code)` (oclif 4 changed the signature).
- **Sequencing**: Phase 4 Task 4 (python/go GHA templates) depends on Phase 2 Tasks 10/11 (python/go scaffolds). Don't attempt this phase until Phase 2 is at least through Task 11.

---

## File Structure

```
arandano/
├── packages/executors-docker/src/
│   ├── client.ts                       extend: parse ssh:// url, configure dockerode
│   └── __tests__/client.test.ts        new: parse url helper
├── packages/templates/stacks/
│   ├── node-ts/.github/workflows/ci.yml          (existing)
│   ├── node-ts/.forgejo/workflows/ci.yml         new
│   ├── node-ts/.gitlab-ci.yml                    new
│   ├── python/{.github/workflows/ci.yml,.forgejo/workflows/ci.yml,.gitlab-ci.yml}
│   └── go/{.github/workflows/ci.yml,.forgejo/workflows/ci.yml,.gitlab-ci.yml}
├── packages/cli/src/commands/init.ts   extend: --forge flag selects workflow files
└── docs/
    └── setup-guide.md                   new
```

---

## Tasks

- [ ] [T1 — Parse the docker host URL (TDD)](T1-parse-the-docker-host-url.md)
- [ ] [T2 — Wire `parseDockerHost` into the dockerode client factory](T2-wire-parsedockerhost-into-the-dockerode-client-fac.md)
- [ ] [T3 — Setup guide — local laptop driving homelab Docker](T3-setup-guide-local-laptop-driving-homelab-docker.md)
- [ ] [T4 — GitHub Actions templates per stack (already partly exist — refine)](T4-github-actions-templates-per-stack.md)
- [ ] [T5 — Forgejo Actions templates](T5-forgejo-actions-templates.md)
- [ ] [T6 — GitLab CI templates](T6-gitlab-ci-templates.md)
- [ ] [T7 — `arandano init --forge=<...>` selection](T7-arandano-init-forge-selection.md)
- [ ] [T8 — End-to-end smoke against the real homelab](T8-end-to-end-smoke-against-the-real-homelab.md)

---

## Exit criteria

## Phase 4 done — exit criteria

- [ ] `executor.docker.host: ssh://...` dispatches workers to a remote homelab daemon
- [ ] `arandano init --forge=github|forgejo|gitlab` picks the right workflow files
- [ ] All three forge templates exercise the full gate suite
- [ ] `docs/setup-guide.md` walks a new user from zero to green PR over SSH
- [ ] At least one end-to-end run against the homelab is documented in the examples README

After this, the next plan covers **Phase 5 — Kubernetes executor (Helm chart for the homelab cluster)**.
