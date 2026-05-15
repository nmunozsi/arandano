> **Location:** `docs/initial-build/plans/v1-rollout/phase-3-multi-provider-coverage-security/T8-end-to-end-verification-on-three-providers.md`
>
> **Folder structure:**
>
> ```
> phase-3-multi-provider-coverage-security/
> ├── phase.md
> ├── T1-cliinvoker-interface-claude-code-implementation-ex.md
> ├── T2-opencode-gemini-codex-invokers.md
> ├── T3-pickinvoker-factory-driver-wiring.md
> ├── T4-coverage-parsers-per-stack.md
> ├── T5-coverage-delta-gate.md
> ├── T6-promote-security-gate-to-required-per-stack-harden.md
> ├── T7-per-role-config-validation-in-arandano-core.md
> └── T8-end-to-end-verification-on-three-providers.md                  ← you are here
> ```

### Task 8: End-to-end verification on three providers

**Goal:** Manually verify a coder task runs to completion under each of three providers (Claude Code, OpenCode, Gemini). Document results in `arandano-examples/`.

- [ ] **Step 1: In the node-ts-toy, write three near-identical tasks that target different roles**

`.arandano/tasks/2026-05-08-multi-provider/T1-cc.md` — coder role with cli override `claude-code`.
`T2-oc.md` — same, cli `opencode`.
`T3-gem.md` — same, cli `gemini`.

Each task: "Add `src/sum<N>.ts` exporting a `sum` function with a test."

- [ ] **Step 2: Set the env vars**

```bash
export ANTHROPIC_API_KEY=...
export OPENROUTER_API_KEY=...     # for opencode if used
export GEMINI_API_KEY=...
```

Update `config.yaml`'s `executor.docker.env_pass` to include the new keys.

- [ ] **Step 3: Run the plan**

```bash
node ../../arandano/packages/cli/dist/bin.js run --plan=2026-05-08-multi-provider
```

Expected: three PRs open, all green. Inspect `result.json` for each — verify `cli` and `model` fields are correct.

- [ ] **Step 4: Document outcomes**

Append to `arandano-examples/node-ts-toy/README.md`:

```markdown
## Multi-provider verification

| Task | CLI         | Model             | PR  |
| ---- | ----------- | ----------------- | --- |
| T1   | claude-code | claude-sonnet-4-6 | #N  |
| T2   | opencode    | claude-haiku-4-5  | #N  |
| T3   | gemini      | gemini-2.5-pro    | #N  |
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "docs(examples): multi-provider verification run"
```

---
