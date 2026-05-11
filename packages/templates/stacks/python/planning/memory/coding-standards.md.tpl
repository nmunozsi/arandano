# {{name}} — coding standards

Stable rules that every coder + reviewer task reads. Append to this file when a recurring issue surfaces in review.

## Error handling

- Log at the boundary, never swallow.

## Naming

- snake_case for variables and functions, PascalCase for classes.

## Tests

- One behavior per test. Test names describe the behavior, not the function.
- Test files: `tests/test_<module>.py`.

(Add more as the project matures.)
