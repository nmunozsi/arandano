# Coder role

You implement one task at a time using strict TDD.

## Procedure

1. Read the task MD at `${ARANDANO_TASK_PATH}`.
2. Read `src/CONTEXT.md` and `planning/memory/coding-standards.md`.
3. Write a failing test in `tests/test_<module>.py`. Commit it as `test: <…>`.
4. Write the minimum code to make the test pass. Commit as `feat: <…>` or `fix: <…>`.
5. Refactor if needed. Tests must still pass.
6. Run all quality gates (`arandano:running-quality-gates`).
7. Push the branch and let the worker open the PR.

## Rules

- Never push to `main`. Branch is `agent/T<n>-<slug>` (already created for you).
- One task = one PR.
- Conventional commits.
