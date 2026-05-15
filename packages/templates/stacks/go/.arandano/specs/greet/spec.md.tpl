> **Location:** `.arandano/specs/greet/spec.md`
>
> **Folder structure:**
>
> ```
> .arandano/specs/greet/
> ├── spec.md          ← you are here
> └── plans/
>     └── initial/
> ```

# {{name}} — greet helper

A toy "hello world" example to verify the scaffold and worker run end-to-end.

## Goal

Ship one tiny module that says hello, with a passing test and a green CI run.

## Acceptance

- `greet.go` exports `Greet(name string) string`.
- `greet_test.go` covers it with at least one test.
- All quality gates pass.
