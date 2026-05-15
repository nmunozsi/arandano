# {{name}} — coding standards

Stable rules that every coder + reviewer task reads. Append to this file when a recurring issue surfaces in review.

## Error handling

- Log at the boundary, never swallow. Return errors — don't panic.

## Naming

- Follow Go conventions: PascalCase for exported, camelCase for unexported.

## Tests

- One behavior per test. Test names: `TestFuncName_scenario`.
- Table-driven tests preferred for multiple cases.

(Add more as the project matures.)
