> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T7-update-docs.md`

---

id: T7
title: Document commit conventions in CLAUDE.md and CONTRIBUTING.md
role: coder
tdd: relaxed
depends_on: [T6]

---

# T7 — Document the new convention

**Files:**

- Modify: `CLAUDE.md` (add a new section "## Commit conventions")
- Modify: `CONTRIBUTING.md` (rewrite the `Conventional Commits required` line + add the curated table)

**Why:** The convention is now enforced but undocumented. Both the human-facing CONTRIBUTING.md and the agent-facing CLAUDE.md need the table so contributors and worker agents know the rule.

---

- [ ] **Step 1: Add a "Commit conventions" section to CLAUDE.md**

Find a sensible location near the existing "Docs and tool folder structure" section. Add this section above or below it (your choice based on flow):

````markdown
## Commit conventions

All commits — both human and worker-authored — MUST follow the format:

```
:emoji: type(scope): subject
```

Where `:emoji:` is one of the 16 curated shortcodes, paired 1:1 with the Conventional Commits type. The custom commitlint pack at `packages/templates/commitlint-rules/` enforces this; the same pack ships with every scaffolded project.

### Curated mapping

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

Use the **shortcode** form (`:sparkles:`), not the unicode glyph. Merge commits (`Merge …`) are exempt.

The worker reads `packages/skills/src/skills/gitmoji-commits/SKILL.md` (baked into the worker image at `/opt/arandano/skills/gitmoji-commits/SKILL.md`) and follows the same rule on every commit it produces.
````

- [ ] **Step 2: Update CONTRIBUTING.md**

Replace the line `3. Conventional Commits required (commitlint enforces).` with:

```markdown
3. **Gitmoji + Conventional Commits required** (commitlint enforces). Every commit subject must match `:emoji: type(scope): subject`. See the curated 16-emoji mapping below.

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

   One worked example per type:

   - `:sparkles: feat(cli): add --with-architect flag`
   - `:bug: fix(executors-docker): inject git safe.directory env vars`
   - `:zap: perf(core): cache loadPlan results between runs`
   - `:recycle: refactor(orchestrator): extract synthesizeArchitectTask`
   - `:white_check_mark: test(core): cover DAG cycle detection`
   - `:memo: docs(plans): mark Task 3 complete`
   - `:art: style(cli): align run.ts argument descriptions`
   - `:wrench: chore(deps): bump dockerode to 4.0.4`
   - `:construction_worker: ci: cache npm install in release workflow`
```

- [ ] **Step 3: Verify the rendered markdown**

```bash
cat CLAUDE.md | grep -A 1 "Commit conventions"
cat CONTRIBUTING.md | grep -A 1 "Gitmoji"
```

Expected: both produce real output.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CONTRIBUTING.md
git commit -m ":memo: docs(commits): document gitmoji + conventional convention"
```

## Acceptance

- `CLAUDE.md` has a "Commit conventions" section with the curated table
- `CONTRIBUTING.md` has the curated table and one worked example per type
- Both files commit with a `:memo:` prefix
