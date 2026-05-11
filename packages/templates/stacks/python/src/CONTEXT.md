# src/

Production code workspace. **TDD is required:** red → green → refactor.

Always read `planning/memory/coding-standards.md` before editing.

Tests live in `tests/test_<module>.py`. Run with `pytest`.

Quality gates run in this order before any PR is opened: format → lint → typecheck → test → coverage → security → commit message.
