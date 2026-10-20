# Analytics — what improvement learns from

*Draft, 20 October 2026. The design for recording, at the right level, whether work is efficient and good. Improvement (the platform loop) selects changes by these numbers and nothing else; see [base.md](base.md) and [INTENT.md](../../idle-harness/INTENT.md).*

## The two numbers

**Efficiency is the cost to reach an approved solution.** It counts everything a task took, from its first turn to approval: every session, the rework after a reopen, the retrospective, and the subagents. It is counted in dollars and in tokens, cached and uncached, with the elapsed time beside them.

**Approval is the human's.** A solution is approved when the human approves it, in whatever way they do: in the chat, on the command line, by approving or merging a pull request. Checks passing is not approval, it is the floor.

**Quality is the rated quality of the approved solution:** the human's score, 1 to 5, given with the approval or later. Nobody else rates, no model stands in. A task not yet rated counts only by its floor: checks passed, no reopen.

A change to a harness is better when tasks after it reach approval for less at the same rating, or rate higher for the same cost. Everything else is a cause to look into, not a result: calls per task, cache share, harness work. Noise is real, so a trend over many tasks counts, never one task.

**The same two numbers per control loop.** A sensor or simulation is worth what it costs against what it contributed: its cost to build, its cost per use (the call and the tokens its answers add to every later turn), how often it reported a problem that was then fixed, and how the tasks that used it ended. Sessions each build their own version of a sensor. The versions are compared on these numbers, and that comparison is what the platform loop selects from.

## The units

| Unit | Where it comes from |
|---|---|
| Turn | A record entry: cost, tokens with cached share, tool calls and results, harness version |
| Session | A record folder in `.sessions/<session>/` |
| Task | An idle-tasks task. One task can span many sessions and harness versions, and one session can work on several tasks |
| Attempt | One claim of a task until it is submitted or released. A reopen starts a new attempt |
| Approval | The human approving the solution, in the chat, on the command line or on a pull request; recorded in idle-tasks |
| Rating | The human's score of the approved solution, 1 to 5, with a note; recorded in idle-tasks |
| Control loop | A tool a session wrote, by version: which session built it, what it cost, every later call to it |
| Platform cost | Improvement sessions, the platform loop's own spend, kept apart from task cost and set against the tasks that follow |

## Attribution: which turns belong to which task

Every command a harness runs carries `IDLE_BY=harness/<name>@<version>`, so idle-tasks already records which harness version claimed, submitted or annotated a task. In the other direction, the harness's record already holds every call it made to idle-tasks, with its result. The analytics reads those calls as boundaries. A claim opens an attempt for that task in that session; a submit, a release or the end of the session closes it. Turns in between belong to the task. A session can also be bound to a task when it starts (`chat --task <id>`). Turns before any claim, or in a session with no task, count as unattributed, are reported as such and are never spread over tasks.

## Review makes approval explicit

Approval has to be a signal, not something read into a merge or a silence. The harness gets a **review** step for both sides of it:

- **The agent asks for review** when it believes a task is done: what changed, how it checked it, and what it could not check. That moves the task to waiting for the human in idle-tasks. The harness does not wait; it goes on with other work (intent I7).
- **The human answers where they are.** In the chat, `/approve 4 the error messages are better than I asked for` or `/reject the totals are still off for refunds`. On the command line, the same through idle-tasks. On a pull request, an approval or a merge, mapped onto the same event. A rejection is a reopen, with its reason.
- **The answer reaches the harness as an inbox item**, so the session that did the work, or the next one, sees it, and its retrospective can use it.

## What it needs from idle-tasks

idle-tasks keeps a task's current state and its feedback and verdict lines. Three things are missing:

1. **The history of a task:** each change of status with its time and actor, appended, never overwritten. Without it, a reopen that was later fixed looks the same as no reopen, and attempts cannot be timed.
2. **The human's approval and rating:** an approval event with its actor and time, and a rating of 1 to 5 with a note, given with the approval or later. A rejection is a reopen with its reason.
3. **Retrospectives**, which are being added to idle-tasks now: one per task, written by whoever drove it, holding the felt evidence the numbers cannot.

All three are records of work, which is what idle-tasks exists for. The harness stays out of storing them.

## Computed, not maintained

The analytics is a reading of files that are already there: the session records under `~/.idle/harness/<name>/.sessions/`, the harness's git history for versions and declarations, and idle-tasks. It keeps no state of its own and can always be recomputed. It runs on this machine and reads everything, since this is a tool for one person.

It answers in three places:

- **`idle-harness stats <harness>`**, for the human: per task, cost to approval, attempts, reopens, rating, harness versions involved; per harness version, the trend; per control loop, its numbers.
- **Improvement sessions** get the same tables as their evidence: the per-task numbers since the last improvement, the versions of every control loop, and the outcome of earlier changes against what each declared.
- **Every change's declaration** is scored later against what happened to cost and rating in the tasks after it. That closes the loop on the platform loop itself.

## Also recorded, for causes

Per compaction: trigger, tokens before and after, what was removed, the cost of the cache rebuild, and re-fetches and repeated failed calls afterwards (see the compaction report). Per model call: cached and uncached input. Per task: where the cost went, by agent, by tool and by control loop. None of these is a goal. They are where improvement looks once the two numbers move.

## Decided

- Approval is the human's, in the chat, on the command line or on a pull request, made explicit by a review step (20 October 2026).
- Only Tobi rates, 1 to 5. No model stands in (20 October 2026).
- Task history, approval and rating live in idle-tasks, next to the retrospectives (20 October 2026).
