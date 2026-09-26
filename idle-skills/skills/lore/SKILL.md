---
name: lore
description: "Capture, scan, or index terse, currently actionable tribal knowledge about non-obvious cross-cutting constraints, workarounds, and gotchas. Use when missing context would cause a future mistake; never use lore as history, a changelog, or a second requirements system."
argument-hint: "[file paths, 'scan' to find undocumented decisions, or 'index' to list all lore]"
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: true
---

# Lore

Lore preserves non-obvious, currently useful context close to affected code. It prevents future mistakes;
it does not record project history, create requirements, or duplicate architecture and project rules.

## Capture

Add `@lore` only when all are true:

- current constraint, workaround, hazard, or trade-off affects future work
- not obvious from nearby code or an authoritative source
- omission would likely repeat a mistake or break an invariant

Never code history: no “X replaced Y,” “previously,” “was added/removed,” “no longer,” “now,” “before this,”
migration narrative, diff recap, or what the code used to do. State only what holds now. Delete stale lore. Link authoritative detail instead of copying it.

Format — exactly one line, always:

```
@lore: <subject> — <constraint>; <consequence or rule>[; <link>]
```

- one line, never wrapped or continued; does not fit → split into separate entries or link out
- fragments only: no sentences, articles, connectives, prose, rationale narrative
- pure information: facts, conditions, numbers, names; drop every word that carries none
- no preamble, background, history, examples, or obvious local behavior

Good: `@lore: PGlite — two processes on one dir fork data silently; lock required; stale after 10 min or dead pid`
Bad: `@lore: PGlite forks the data silently when two processes open one directory, so the lock is what…`

## Scan

Find candidates that pass the capture test. Present only location, proposed one-line annotation, and evidence.
Obtain user approval before modifying code.

## Index

List current lore by kind — constraint, workaround, hazard, trade-off — and location, including contradictions, stale entries, and any entry longer
than one line, written as prose, or narrating code history. Terse entries; no conversational framing. Do not edit — report.

Missing lore blocks a task only when a non-obvious invariant would otherwise live nowhere but the task
record. A decision that still explains why the code looks the way it does belongs beside that code.

When capturing or revising an entry, cut it back to the one-line format.

## Target

$ARGUMENTS
