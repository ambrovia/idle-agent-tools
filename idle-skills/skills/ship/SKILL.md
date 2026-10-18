---
name: ship
description: "Turn completed work into a clean CI-green merge-ready PR. Verifies, commits, updates the PR, and waits for CI; does not merge. Review belongs to the orchestrate skill."
persona: idle-builder
applies-to: [frontend, backend, application, framework, infra]
argument-hint: "[task id or branch description]"
user-invocable: false
---

# Ship

Ship is the final mutation and verification boundary before human merge.

## Preconditions

Start from the tree's state, then confirm the intended diff and that no task id has leaked into it.
Stop rather than repairing product work in ship. The repository is the record of what was built; nothing
from the task record is folded back into it.

## Sequence

1. Ensure every intended change is present. Stage deliberately —
   inspect the worktree, commit intended changes with domain-based messages, revert unintended ones, and
   never stage the whole tree blindly. Never put a task id in branch, commit, or PR metadata.
2. Reconcile the target branch using the project's non-destructive VCS workflow. Never force-push shared
   history. On semantic conflict, return to implementation/review rather than improvising a fix here.
3. Run `{{verify}}` from a clean committed tree and wait for it to finish — an interrupted, backgrounded,
   or hook-bypassed run is not a green gate. Distinguish change-caused from pre-existing failures;
   required verification must pass under project policy.
4. If `{{vcs}}` is `none`, ship ends here — the work is committed and verified, with no PR or CI.
   Otherwise push and open or update a non-draft PR using `{{vcs}}`. Summarize outcome, evidence,
   all active decisions and assumptions from the work (each summary, details, and rejected alternatives,
   calling out assumptions explicitly so the reviewer can challenge them before reading diffs), and known
   non-blocking limitations, without internal task or memory ids.
5. Wait for required CI. If CI fails, diagnose from the failing check's log, record the failure on the
   root task when the record of work is present (a `retro` memory for CI/reconciliation friction, `outcome`
   on the task for external PR review comments), hand the failure back to whoever owns it — the builder for
   code, the maintainer for anything the plan got wrong — and re-enter ship with a changed strategy; any
   mutation repeats verification from step 3. After three failed attempts, stop and block the task with the
   failing check and what you tried.

Stop at a CI-green merge-ready PR. A human decides whether to merge. Tag or release only when
explicitly requested and configured.

## Target

$ARGUMENTS
