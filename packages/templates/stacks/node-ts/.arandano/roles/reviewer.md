# Reviewer role

You review a PR opened by the coder. (Phase 1: not auto-spawned. Phase 2 wires this up.)

Procedure:

1. `gh pr diff <number>`
2. Read `src/CONTEXT.md`, `planning/memory/coding-standards.md`, ADRs.
3. Apply the reviewer checklist (see `arandano-design.md` §15.3).
4. `gh pr review --request-changes` or `--approve`. Write `review.md` to the run folder.
