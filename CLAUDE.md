# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated issues, mention them — don't fix them.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan with verification at each step.

## 5. Project Context

<!-- Fill in per project -->
<!-- - Tech stack: -->
<!-- - Architecture overview: -->
<!-- - Key dependencies: -->
<!-- - Directory structure conventions: -->

## 6. Coding Standards

- Follow existing patterns in the codebase.
- No premature abstractions — three similar lines beat one speculative helper.
- Prefer readability over cleverness.
- Error handling at system boundaries only (user input, external APIs).

## 7. Git Workflow

- Conventional Commits required: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`, `perf:`, `style:`
- Keep PRs small and focused — one concern per PR.
- Write meaningful commit messages explaining why, not what.
- Never force-push to shared branches.

### Worktree per feature (parallel sessions)

Multiple agents / windows on the same checkout step on each other when they
switch branches — modified files get reset under you and uncommitted work
disappears. The fix is a git worktree per concurrent task.

**Rule:** any new feature, P0/P1 chunk, or non-trivial fix gets its own
worktree. Don't `git checkout` a new branch in the primary checkout while
another session is mid-task there.

**Naming + location:** sibling directory of the main repo, named for the
branch slug.

```bash
# Pattern:  ../wavydanceai-<branch-slug>
git worktree add ../wavydanceai-feat-2fa-totp -b feat/p1-2fa-totp origin/main

# When you finish (PR merged):
git worktree remove ../wavydanceai-feat-2fa-totp
git branch -d feat/p1-2fa-totp   # if the merge was a squash
```

The agent should `cd` into the new worktree before doing any work. The
primary checkout stays on `main` (or whichever branch was active) and
remains safe for the other session.

**Skip the worktree only for:** one-line typo / comment fixes on the
current branch, or pure read-only exploration. Anything that mutates more
than ~2 files gets a worktree.

**Cleanup hygiene:** when reporting a PR done, also report the worktree
path so the user knows where to remove. Stale worktrees on disk are fine
short-term but should be `git worktree prune`'d periodically.

### Never commit local dev artifacts

The following artifacts are produced by tooling during local development /
verification and **must not be committed**. They live in `.gitignore`; if you
see one staged, unstage it instead of editing the ignore rules.

- **Playwright / browser screenshots** generated during smoke tests:
  - PNG / JPEG / WebP files at the repo root (e.g. `console-light.png`,
    `demo-glass.png`, `*-fullpage.jpeg`)
  - The `.playwright-mcp/` directory (page snapshots + console logs from
    the Playwright MCP server)
- **Chrome DevTools MCP** profile / cache (`.cache/chrome-devtools-mcp/` etc.)
- Anything in `/tmp/` referenced by absolute path in scripts — never copy
  these into the repo.

Verification screenshots are for the assistant to confirm a change locally;
attach them to the PR description or paste into chat instead of checking
them into source control. Legitimate product assets belong in
`web/wavy/public/` or `web/web_reference/assets/`, not the repo root.

## 8. PR Expectations

- Fill out the PR template completely.
- Ensure all CI checks pass before requesting review.
- Respond to CodeRabbit/Copilot findings — dismiss with a reason or fix.

## 9. File Organization

<!-- Fill in per project -->
<!-- - Describe your directory structure conventions here -->
- Co-locate related files.
- Avoid deep nesting.

## 10. Secrets and credentials

**Never deploy with default credentials.** The backend seeds a root
account (`root` / `123456`) on first boot when the users table is empty.
This is documented publicly across every One-API fork and is therefore
treated as a known credential.

- Always set `INITIAL_ROOT_PASSWORD` before the first boot of any
  deployment reachable from outside localhost. Optionally also set
  `INITIAL_ROOT_TOKEN` and `INITIAL_ROOT_ACCESS_TOKEN`.
- If you forgot and the default account exists, sign in and change the
  password immediately via the user settings before adding any
  channels or tokens.
- Set `SESSION_COOKIE_SECURE=true` in production so the session cookie
  is only sent over TLS.
- `SESSION_SECRET` must be a random 32+ byte string per deployment.
  Never reuse across environments.
- Don't commit `.env` files. The repo's `.gitignore` already blocks
  `.env*` (except `.env.example`).
