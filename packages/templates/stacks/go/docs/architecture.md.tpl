> **Location:** `docs/architecture.md`

# {{name}} — Architecture

_Last updated by: arandano architect role — `<plan-slug>` plan (YYYY-MM-DD)_

## 1. Overview

One paragraph: what this project does and the shape of the system at a glance.

## 2. Components

| Component  | Path           | Responsibility       | Stack              |
| ---------- | -------------- | -------------------- | ------------------ |
| _e.g._ CLI | `packages/cli` | User-facing commands | TypeScript / oclif |

## 3. Data flow

```mermaid
flowchart LR
  user[User] --> cli[CLI]
  cli --> ...
```

One diagram. If multiple flows matter, add labelled sub-headings under H3 — never more than three.

## 4. Tech stack

- **Language(s):** …
- **Runtime:** …
- **Build:** …
- **Test:** …
- **CI:** …
- **External services / APIs:** …

## 5. Key decisions

Append-only, dated, newest first. Format:

- **YYYY-MM-DD — D<n>: <short title>.** _Why:_ … _Trade-off:_ … _Owner:_ @handle.

## 6. Open questions

Same format as §5. Entries are removed when resolved (their resolution lands in §5).
