---
name: dependabot-audit
description: Audit open Dependabot PRs against the committed lockfile, triage superseded vs. needed vs. major bumps (stop for approval before closing anything), close the stale ones and verify, then add a well-commented .github/dependabot.yml with one grouped stream per dependency tree. Use when asked to audit, clean up, or configure Dependabot.
---

Audit and clean up Dependabot in this repo, then configure it properly.

## 1. Audit what's open

List open Dependabot PRs with their CI status:

    gh pr list --author "app/dependabot" --state open --json number,title,headRefName,statusCheckRollup

For each PR, decide whether it's still needed. Compare the version it proposes
against what's ALREADY in the committed lockfile on the default branch. Read the
lockfile directly; don't trust the PR title. Also run the ecosystem's audit
command (`npm audit`, `pip-audit`, `cargo audit`, etc.) to see whether any
security motivation still stands.

Dependabot PRs often go stale because a manual dependency upgrade landed after
they were opened and swept the same versions in. Check recent commit history for
exactly that.

## 2. Triage, then STOP

Split the PRs into:
(a) fully superseded: the lockfile on main already has the proposed version
(b) still-needed real bumps
(c) major-version bumps needing hand-review

Show me the table before you change anything. Say which you'd close and which
you'd merge. Wait for my go-ahead before closing anything.

## 3. Close the superseded ones

`@dependabot close` as a PR comment is unreliable. It can sit unprocessed for
15+ minutes or be silently ignored. Post it if you like, but VERIFY the PR
closed, and fall back to `gh pr close <n> --delete-branch` if it didn't. Don't
report them closed until `gh pr list --author "app/dependabot" --state open`
returns empty and `git ls-remote --heads origin 'dependabot/*'` shows no
leftover branches. Dependabot sometimes self-closes stale PRs ("Looks like
these dependencies are up-to-date now"). If that already happened, don't take
credit for it.

## 4. Add .github/dependabot.yml

If the repo has no dependabot.yml, it's running on GitHub UI defaults. That
produces a scattered pile of one-PR-per-dependency.

FIRST, find every dependency tree. Don't assume there's one:

    git ls-files '*package.json' '*requirements*.txt' '*pyproject.toml' '*Cargo.toml' '*go.mod' '*Gemfile' '*Dockerfile*' | grep -v node_modules

Nested packages (workers, functions, tools, sub-apps) have their own lockfiles
that the root install never touches, and UI defaults usually don't watch them.
That gap is often the most valuable thing this task fixes. Add one entry per
tree, plus one for `github-actions` if `.github/workflows/` exists, plus any
other ecosystems present (pip, cargo, docker, gomod, etc.).

Config shape:

- Group minor + patch into ONE PR per stream: weekly (day: monday) for
  dependencies, monthly for github-actions.
- Leave majors UNGROUPED so each gets its own PR. Majors need hand-checking and
  must not ride along inside a bundle of patch bumps.
- Set the commit-message prefix to match this repo's existing commit convention.
  Read `git log` to find it rather than guessing. Use a different prefix for
  actions (e.g. `ci`) than for dependencies (e.g. `build` or `chore`), with
  `include: scope`.
- Set `open-pull-requests-limit` deliberately. Budget for: one group PR, one PR
  per excluded package (see below), and room for several ungrouped majors at
  once. A limit that's too low starves a stream rather than quieting it.
- Comment the file. Explain why each stream exists and why majors are ungrouped.

Pitfalls to handle in the config. Each one bit a real repo:

1. **0.x packages break the "majors are ungrouped" rule.** Semver treats 0.x
   specially, so Dependabot calls a 0.19 → 0.20 move a "minor" and the
   `update-types: [minor, patch]` filter admits it. It can carry transitive
   majors into a PR labelled "minor-and-patch". A caret range like `^0.35`
   doesn't admit 0.36 either, so a 0.x "minor" is a major in all but name.
   Find every 0.x DIRECT dependency in each package.json, put them in that
   stream's `exclude-patterns`, and note in a comment that the list must stay in
   step with package.json.
2. **Packages that must move in lockstep need their own group.** If one package
   pins another at an exact version (a test runtime pinning a CLI, a plugin
   pinning its host), bumping them apart can make npm install a second, nested
   copy of the pinned one. Put them in one group, listed FIRST (a dependency
   joins the first group it matches), and exclude them from the general group.
   Look for this by checking `npm ls <pkg>` for duplicated nested copies.
3. **Dependabot can't follow a package rename.** If a dependency is quiet while
   its siblings keep releasing, check its repo for a rename or successor.
   Silence from a stream is not proof the dependency is current.
4. **Version-update groups don't govern security PRs.** `groups:` entries default
   to `applies-to: version-updates`. Don't add `applies-to: security-updates`
   unless you intend to override the repo-level "Grouped security updates"
   setting.

## 5. Update docs

If a CLAUDE.md, README, or contributing doc describes the `.github/` layout or
directory structure, add the dependabot.yml entry in the same change. If the
repo documents its dependency policy anywhere, update that too.

## 6. Ship it

Create a branch first. Don't commit to the default branch. Commit, push, and open
a PR following the repo's PR template if one exists
(`.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE/`). Run the
repo's full build/test before claiming the checklist passes. Don't tick boxes
you haven't verified. Report the PR URL and CI status.

## Tell me these things plainly, don't paper over them

- The config has NO effect until it's merged to the default branch.
- Grouping applies to scheduled version updates only. Dependabot SECURITY alerts
  still open individual PRs unless the repo's "Grouped security updates" setting
  is on, and a grouped security PR can contain a MAJOR bump. Don't imply
  otherwise.
- If `gh api repos/:owner/:repo/dependabot/alerts` returns 403, my token lacks
  the `security_events` scope. Flag it as unverified rather than assuming 0
  alerts.
- If any step partially fails, say which part and what state things are in.
- In a git worktree, `gh pr merge --delete-branch` can fail AFTER the merge
  lands (it tries to check out the default branch, which the primary worktree
  already holds). If that happens, confirm the merge state with
  `gh pr view <n> --json state` and delete the remote branch separately. Don't
  re-run the merge.
