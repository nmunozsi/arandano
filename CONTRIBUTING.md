# Contributing to arandano

Thanks for your interest. arandano is in early development; APIs and structures will change.

## Workflow

1. Open an issue describing the change you want to make.
2. Fork, branch (`feat/<short-slug>` or `fix/<short-slug>`), and open a PR against `main`.
3. **Gitmoji + Conventional Commits required** (commitlint enforces). Every commit subject must match `:emoji: type(scope): subject`.

   | Shortcode               | Type     | Use for                          |
   | ----------------------- | -------- | -------------------------------- |
   | `:sparkles:`            | feat     | New feature for the user         |
   | `:bug:`                 | fix      | User-visible bug fix             |
   | `:ambulance:`           | fix      | Critical hotfix                  |
   | `:lock:`                | fix      | Security-impacting fix           |
   | `:zap:`                 | perf     | Performance improvement          |
   | `:recycle:`             | refactor | Refactor with no behavior change |
   | `:fire:`                | refactor | Remove code/files                |
   | `:white_check_mark:`    | test     | Add or update tests              |
   | `:memo:`                | docs     | Docs only                        |
   | `:art:`                 | style    | Formatting, whitespace, no logic |
   | `:rotating_light:`      | style    | Fix linter warnings              |
   | `:wrench:`              | chore    | Config / tooling                 |
   | `:construction_worker:` | ci       | CI changes                       |
   | `:arrow_up:`            | chore    | Upgrade dependencies             |
   | `:arrow_down:`          | chore    | Downgrade dependencies           |
   | `:bookmark:`            | chore    | Release / version tag            |

   Examples — one per type:

   - `:sparkles: feat(cli): add --with-architect flag`
   - `:bug: fix(executors-docker): inject git safe.directory env vars`
   - `:zap: perf(core): cache loadPlan results between runs`
   - `:recycle: refactor(orchestrator): extract synthesizeArchitectTask`
   - `:white_check_mark: test(core): cover DAG cycle detection`
   - `:memo: docs(plans): mark Task 3 complete`
   - `:art: style(cli): align run.ts argument descriptions`
   - `:wrench: chore(deps): bump dockerode to 4.0.4`
   - `:construction_worker: ci: cache npm install in release workflow`

4. All PRs run the full quality gate suite (lint, types, tests, coverage, security). All gates must pass.
5. By contributing, you agree your contributions are licensed under the MIT License.

## Development setup

```bash
nvm use            # Node 22
npm ci
npm run build
npm test
```
