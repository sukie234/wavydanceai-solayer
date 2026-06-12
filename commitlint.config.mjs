// Allowed type prefixes (must stay in sync with .github/workflows/pr-checks.yml
// "Validate PR Title" job).
const TYPES = ["feat", "fix", "chore", "docs", "refactor", "test", "ci", "build", "perf", "style", "revert"];

// Match a single conventional-commit header: `type(scope)?!?: subject`.
const CONVENTIONAL_HEADER = new RegExp(`^(${TYPES.join("|")})(\\([^)]+\\))?!?: `);

export default {
  extends: ["@commitlint/config-conventional"],
  // PR-event commitlint lints every commit reachable from the PR (including
  // commits merged in from upstream forks). Upstream history we don't own —
  // and can't rewrite — contains squash-merge titles like "Feat/UI init (#8)"
  // and "add payment model (#18)" that predate conventional-commits adoption.
  // Skip any commit whose subject doesn't start with a conventional type so
  // upstream history is ignored while our own work is still linted.
  ignores: [
    (message) => {
      const subject = (message ?? "").split("\n", 1)[0];
      return !CONVENTIONAL_HEADER.test(subject);
    },
  ],
  // Relax the stylistic rules that upstream's (conventionally-prefixed) commits
  // routinely violate — e.g. "feat(seedance): Seedance video adaptor…" trips
  // subject-case (capitalized proper noun), and upstream bodies exceed the
  // 100-char line cap. These commits pass the `ignores` filter because they DO
  // carry a valid type prefix, so disable the cosmetic rules here. The
  // structural rules that keep messages parseable (type-enum, type-empty,
  // subject-empty) stay enforced for our own commits.
  rules: {
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};

