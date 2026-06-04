# Copilot Code Review Instructions

When reviewing pull requests, focus on:

## What to Review

- **Logic errors** — incorrect conditions, off-by-one errors, missing edge cases, race conditions
- **Security issues** — injection vulnerabilities, hardcoded secrets, insecure defaults, missing auth checks
- **Performance concerns** — unnecessary allocations, N+1 queries, missing indexes, unbounded loops
- **Edge cases** — null/undefined handling, empty collections, boundary values, error paths
- **API design** — unclear naming, inconsistent patterns, breaking changes without documentation

## What NOT to Review

Do not flag style or formatting issues — these are handled by MegaLinter and project-specific linters. This includes:

- Indentation, spacing, line length
- Import ordering
- Naming conventions (unless genuinely confusing)
- Missing comments on self-explanatory code
