> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T11-go-stack-scaffold-worker-preflight.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md
> ├── T2-plan-loader.md
> ├── T3-orchestrator-class-drives-a-plan-to-completion.md
> ├── T4-synthetic-reviewer-task-generator.md
> ├── T5-reviewer-driver-inside-the-worker.md
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md
> ├── T11-go-stack-scaffold-worker-preflight.md                         ← you are here
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 11: Go stack scaffold + worker preflight

Same shape as Task 10 with Go tooling. Files:

- `packages/templates/stacks/go/`:
  - `go.mod.tpl` (`module {{name}}`, `go 1.23`)
  - `.golangci.yml` enabling default linters
  - `.github/workflows/ci.yml` running `gofmt -l`, `golangci-lint run`, `go test ./...`, `govulncheck ./...`
  - role MDs, scaffold structure
- `arandano-worker/lib/src/gates/go/{format,lint,test,coverage,security}.ts` — wrapping `gofmt`, `golangci-lint run`, `go test ./...`, `go test -coverprofile`, `govulncheck`.
- Update `init.ts` to accept `--stack=go`.

Smoke-test with a Go toy in `arandano-examples/go-toy/`.

- [x] **Step 1: Create Go template tree** (mirror previous tasks)

- [x] **Step 2: Implement Go gate wrappers**

- [ ] **Step 3: Add Go toy and verify PR opens** ⏸ **deferred — needs Docker**

- [x] **Step 4: Commit** (arandano: 01db3e0, arandano-worker: d9a1d40 — go gates included)

---
