# Contributing to arandano

Thanks for your interest. arandano is in early development; APIs and structures will change.

## Workflow

1. Open an issue describing the change you want to make.
2. Fork, branch (`feat/<short-slug>` or `fix/<short-slug>`), and open a PR against `main`.
3. Conventional Commits required (commitlint enforces).
4. All PRs run the full quality gate suite (lint, types, tests, coverage, security). All gates must pass.
5. By contributing, you agree your contributions are licensed under the MIT License.

## Development setup

```bash
nvm use            # Node 22
npm ci
npm run build
npm test
```
