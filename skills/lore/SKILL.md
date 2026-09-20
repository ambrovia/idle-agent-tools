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

Reject chronology: “X replaced Y,” “previously,” migration narrative, diff recap. Historical facts qualify
only when they explain an active compatibility constraint or trap; write the present constraint, not its
succession story. Delete stale lore. Link authoritative detail instead of copying it.

Write telegraphic fragments: no full sentences, optional grammar, minimum words for unambiguous meaning.
One line preferred; two only when a link or essential condition needs its own line. No preamble, background,
or obvious local behavior.

## Scan

Find candidates that pass the capture test. Present only location, terse proposed annotation, and evidence.
Obtain user approval before modifying code.

## Index

List current lore by kind — constraint, workaround, hazard, trade-off — and location, including contradictions, stale entries, and any that have
grown past a line or two. Terse entries; no conversational framing. Do not edit — report.

Missing lore blocks a task only when a non-obvious invariant would otherwise live nowhere but the task
record. A decision that still explains why the code looks the way it does belongs beside that code.

When capturing or revising an entry, cut anything that has grown into a paragraph back to the
constraint.

## Target

$ARGUMENTS
