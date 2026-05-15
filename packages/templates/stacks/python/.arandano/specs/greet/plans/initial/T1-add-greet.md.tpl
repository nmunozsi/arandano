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

- `src/greet.py` exports `greet(name: str) -> str` returning `f"Hello, {name}!"`.
- `tests/test_greet.py` tests it with at least one case.
- All quality gates pass.
