> **Location:** `.arandano/specs/greet/plans/initial/T1-add-greet.md`
>
> **Folder structure:**
>
> ```
> .arandano/specs/greet/plans/initial/
> ├── plan.md
> └── T1-add-greet.md  ← you are here
> ```

---
id: T1
title: add greet helper
role: coder
---

## Goal

Add a `greet` function that returns a greeting string.

## Requirements

- `src/greet.ts` exports `greet(name: string): string` returning `"Hello, <name>!"`.
- `src/greet.test.ts` tests it with at least one case.
- All quality gates pass.
