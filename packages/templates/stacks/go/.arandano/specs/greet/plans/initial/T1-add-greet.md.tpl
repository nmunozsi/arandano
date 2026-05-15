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

Add a `Greet` function that returns a greeting string.

## Requirements

- `greet.go` exports `Greet(name string) string` returning `fmt.Sprintf("Hello, %s!", name)`.
- `greet_test.go` tests it with at least one case.
- All quality gates pass.
