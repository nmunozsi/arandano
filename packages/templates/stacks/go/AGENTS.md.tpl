# {{name}}

> Project identity: <one sentence — fill in>

## Tech stack

- Go 1.23
- gofmt (format)
- golangci-lint
- go test + coverage
- govulncheck

## Workspaces

| Workspace   | Purpose                            |
| ----------- | ---------------------------------- |
| `/planning` | Specs, plans, ADRs, memory, issues |
| `/src`      | Production code (TDD)              |
| `/docs`     | User-facing documentation          |
| `/ops`      | Deploy + runbooks                  |

## Routing table

| Task                     | Workspace  | Read                                            | Skills                                                                                                          |
| ------------------------ | ---------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Brainstorm / spec / plan | /planning  | CONTEXT.md                                      | superpowers:brainstorming, superpowers:writing-plans                                                            |
| Implement a task (TDD)   | /src       | CONTEXT.md, planning/memory/coding-standards.md | superpowers:test-driven-development, superpowers:verification-before-completion, arandano:running-quality-gates |
| Open PR                  | /src       | CONTEXT.md                                      | superpowers:requesting-code-review                                                                              |
| Debug                    | /src, /ops | CONTEXT.md                                      | superpowers:systematic-debugging                                                                                |

## Naming conventions

- Spec: `planning/specs/YYYY-MM-DD-<slug>-design.md`
- Plan: `planning/plans/YYYY-MM-DD-<slug>-plan.md`
- ADR: `planning/decisions/YYYY-MM-DD-<slug>.md`
- Issue: `planning/issues/YYYY-MM-DD-<slug>.md`
- Task: `.arandano/tasks/<plan-slug>/T<n>-<slug>.md`
- Branch: `agent/T<n>-<slug>`
- PR title: `[T<n>] <task title>`
- Test: colocated `*_test.go`

This file is canonical. `CLAUDE.md` and `GEMINI.md` are mirrors.
