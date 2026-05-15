> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/phase.md`
>
> **Folder structure:**
>
> ```
> phase-3-multi-provider-coverage-security/
> ├── phase.md                                                          ← you are here
> ├── T1-cliinvoker-interface-claude-code-implementation-ex.md
> ├── T2-opencode-gemini-codex-invokers.md
> ├── T3-pickinvoker-factory-driver-wiring.md
> ├── T4-coverage-parsers-per-stack.md
> ├── T5-coverage-delta-gate.md
> ├── T6-promote-security-gate-to-required-per-stack-harden.md
> ├── T7-per-role-config-validation-in-arandano-core.md
> └── T8-end-to-end-verification-on-three-providers.md
> ```

# arandano Phase 3 — Multi-Provider CLI, Coverage Delta, Security Gates Implementation Plan

> **Updated 2026-05-11 after Phase 1 landed.** See "Phase 1 reality check" below before executing — Task 1's refactor target and `pickInvoker` wiring point have been pinned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-role CLI/model config real. The worker must dispatch to Claude Code, OpenCode, Gemini CLI, or Codex based on `cli:` in the role/task. Add coverage-delta enforcement (refuse PRs that drop coverage relative to the base branch when `coverage.delta: nonneg`). Promote security from `warn` to `required` by default. Verify every gate path on at least three providers.

**Architecture:** A new `CliInvoker` interface in the worker — one implementation per CLI. The driver picks an invoker based on `ARANDANO_CLI`. Coverage delta needs the base-branch coverage report; the worker checks out `main` in a worktree, runs coverage there, then compares numbers. Security gates already exist (Phase 1/2) — we just flip their default mode and add per-stack hardening.

**Tech Stack:** Adds OpenCode CLI, Gemini CLI, Codex CLI inside the worker image. Adds `c8`/`coverage.py`/`go test -cover` JSON output parsing.

**Reference spec:** `arandano-design.md` §9 (D9, D10), §13.1 (`roles:`), §15.2 (gate ordering), §24 Phase 3.

**Scope deferrals:**

- Per-task budget enforcement (max tokens, max USD) — out of scope for v1 entirely.
- Remote Docker over SSH — Phase 4.

---

## Phase 1 reality check (2026-05-11)

This phase refactors Phase 1's worker `invokeCli`. Lock these in before executing:

**Phase 1 surfaces this plan touches:**

- `invokeCli` — `arandano-worker/lib/src/invokeClaudeCode.ts`:
  ```ts
  export async function invokeCli(opts: {
    cli: string;
    args: string[];
    prompt: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }): Promise<{ exitCode: number; output: string }>;
  ```
  The implementation `spawn(opts.cli, opts.args, { cwd, env })` and `proc.stdin.end(opts.prompt)` is Windows-compatible because the test passes `cli: process.execPath, args: [script]` rather than relying on shebang execution. **Task 1's `CliInvoker` extraction must preserve the `cli + args` separation** — invokers that want to spawn `node <script>` (in tests) must be able to do so.
- Worker driver — `arandano-worker/lib/src/driver.ts:70-76`:
  ```ts
  const cliRun = await invokeCli({
    cli,
    args: ['--print'],
    prompt,
    cwd: workspace,
    env: process.env,
  });
  ```
  This is the line Task 3's `pickInvoker` replaces. After the refactor it becomes:
  ```ts
  const invoker = pickInvoker(cli);
  const cliRun = await invoker.invoke({
    prompt,
    cwd: workspace,
    env: process.env,
    model,
    timeoutMs,
  });
  ```
- Role config — `packages/core/src/types/role.ts` — the field name is `cli`, **not** `provider`. Task 7's validation extends the Zod schema in this file; check the actual file before writing code blocks that reference `roleConfig.provider`.
- Env-var helper idiom — `arandano-worker/lib/src/driver.ts`:
  ```ts
  const env = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`missing env: ${k}`);
    return v;
  };
  ```
  New invoker code that reads env should follow this pattern, not `process.env.X!`.

**Per-task corrections:**

- **Task 1** (`ClaudeCodeInvoker`): the test's shim binary uses `chmod 0o755 + shebang`, which won't work on Windows (Phase 1 hit this exact issue with `invokeClaudeCode.test.ts`). Use the Phase 1 pattern: `cli: process.execPath, args: [shimScriptPath]` so the test runs on every OS. The container only ever runs on Linux, so the actual `claude` binary invocation is unaffected.
- **Task 1** (driver wiring): the plan's Step 4 says "modify driver.ts to use the new invoker"; the exact replacement target is `driver.ts:70-76` (quoted above). Quote the full `await invokeCli(...)` call when describing the replacement.
- **Task 3** (`pickInvoker`): import path is `../cli/pickInvoker.js`, called from `driver.ts`. Keep the existing `cli` variable name (sourced from `env('ARANDANO_CLI')`); don't rename.
- **Task 7** (per-role config validation): cross-check `packages/core/src/types/role.ts` before drafting Zod schemas — the field is `cli: z.string()` (already there); the validation Phase 3 adds is `.refine((v) => SUPPORTED.includes(v))`. Don't introduce a new `provider` field.
- **General**: `coverageDelta.ts` and the parsers consume `runShell` from `arandano-worker/lib/src/gates/_shell.ts` (Phase 1) — same `ShellResult` shape `{ passed, exitCode, output, durationMs }`.

---

## File Structure

```
arandano-worker/
└── lib/src/
    ├── cli/
    │   ├── CliInvoker.ts                interface
    │   ├── claudeCode.ts
    │   ├── opencode.ts
    │   ├── gemini.ts
    │   ├── codex.ts
    │   ├── pickInvoker.ts
    │   └── __tests__/{pickInvoker,*Invoker}.test.ts
    ├── gates/
    │   ├── coverageDelta.ts             new
    │   ├── parseCoverage/
    │   │   ├── nodeTs.ts                read coverage/coverage-summary.json
    │   │   ├── python.ts                read coverage.json
    │   │   └── go.ts                    read coverage.out
    │   └── __tests__/{parseCoverage/*,coverageDelta}.test.ts
    └── driver.ts                        modify: select invoker by ARANDANO_CLI

arandano/
└── packages/core/src/
    ├── types/role.ts                    extend: cli + model required, validate provider list
    └── config/load.ts                   extend: validate cli ∈ supported set
```

---

## Tasks

- [ ] [T1 — `CliInvoker` interface + Claude Code implementation extracted (TDD)](T1-cliinvoker-interface-claude-code-implementation-ex.md)
- [ ] [T2 — OpenCode, Gemini, Codex invokers (TDD with shims)](T2-opencode-gemini-codex-invokers.md)
- [ ] [T3 — `pickInvoker(name)` factory + driver wiring (TDD)](T3-pickinvoker-factory-driver-wiring.md)
- [ ] [T4 — Coverage parsers per stack (TDD)](T4-coverage-parsers-per-stack.md)
- [ ] [T5 — Coverage-delta gate (TDD)](T5-coverage-delta-gate.md)
- [ ] [T6 — Promote security gate to required + per-stack hardening](T6-promote-security-gate-to-required-per-stack-harden.md)
- [ ] [T7 — Per-role config validation in `@arandano/core`](T7-per-role-config-validation-in-arandano-core.md)
- [ ] [T8 — End-to-end verification on three providers](T8-end-to-end-verification-on-three-providers.md)

---

## Exit criteria

## Phase 3 done — exit criteria

- [ ] Worker dispatches to four CLIs based on `ARANDANO_CLI`; each invoker preflights the right env var
- [ ] `cli` in `roles:` rejects anything outside the supported set
- [ ] Coverage delta vs. base branch is enforced when `coverage.delta: nonneg`
- [ ] Security gate is `required` by default; npm-audit + gitleaks (node-ts), pip-audit + gitleaks (python), govulncheck + gitleaks (go) all run
- [ ] At least three providers verified end-to-end on the node-ts toy

After this, the next plan covers **Phase 4 — Remote homelab Docker (SSH) + CI workflow templates per forge**.
