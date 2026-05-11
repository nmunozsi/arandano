# src/

Production code workspace. **TDD is required:** red → green → refactor.

Always read `planning/memory/coding-standards.md` before editing.

Tests are colocated as `*.test.ts`. Run with `npx vitest`.

Quality gates run in this order before any PR is opened: format → lint → typecheck → test → coverage → security → commit message.
