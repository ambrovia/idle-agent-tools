---
name: compound
description: "Review accumulated retros, identify recurring evidence-backed process patterns, and propose surgical skill or workflow changes for human approval. Never applies changes automatically."
argument-hint: "[optional: 'review' or 'status']"
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: true
---

# Compound

Read the candidate tracker at `.pipeline/compound-candidates.md`, then the `retro:` feedback on the root
of every stream of this project, archived ones included. If the tracker does not exist, create it with a title and no rows.

You are the only writer of that tracker, and you run at maintainer cadence — after several streams,
never inside a run. That is what makes a single shared file safe here: nothing a run writes lands in
the repository, so concurrent branches never touch the same path. The tracker carries the classification
forward so this skill does not re-derive every pattern from scratch each time.

Group observations only when they describe the same behavioural mechanism. Three independent
occurrences qualify a pattern for consideration; they do not prove the diagnosis.

Classify patterns as emerging, confirmed, contradicted, or resolved. Report each confirmed pattern to
the maintainer with:

- occurrences and evidence;
- likely mechanism and competing explanation;
- behavior worth preserving;
- one smallest proposed process/skill change;
- expected benefit, regression risk, and how to validate it.

Recurring `divergence` observations propose an amendment to the `taste` rule slot rather than a skill
change; quote the corrections it would have prevented. Never propose one from a single correction,
and propose one only when it holds across the repository — per-stream preferences belong in that
stream's plan, and the slot stays short enough to read.

Propose; never apply. Do not delete history, convert anecdotes into mandates, or bundle unrelated
changes. Update tracker state and retain contradiction and resolution evidence. Human approval is
required before any policy mutation.

## Target

$ARGUMENTS
