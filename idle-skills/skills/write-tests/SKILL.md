---
name: write-tests
description: "Create proportionate failing evidence for a task's goal before implementation when behavior is regressible and an automated test is appropriate. Use in the build phase; do not let tests create requirements."
persona: pipeline-builder
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Write tests

Start from the task's brief; then read approved design when present, `{{rules.testing}}`
from `pipeline.config.yml`, and the existing tests under `{{paths.tests}}`. Mechanical check results
injected at skill load are the pre-change baseline — read the suite's starting state from them rather
than re-running it. Write the failing test before the code that satisfies it — a test written
afterwards records what was built, not what was required. Behavior proven instead by static, rendered,
or recorded manual evidence must be named as such by the task or `{{rules.testing}}`; that exception is
not chosen at build time. Prefer existing test lanes and focused behavioral assertions.

Where the goal names end-to-end evidence, produce it alongside. Use the lane it names; do not build a parallel harness, and do not upgrade a named manual check into new automation.

Tests prove the goal and applicable invariants. They may not add outcomes, freeze incidental
implementation, or require unrelated infrastructure. Preserve protected assertions and existing test
meaning.

Test the behavior the goal names and stop there. Acceptance criteria point at what to test; they are
not a list to mirror one test each. Each test earns its place by being able to fail for a reason someone would
care about, so test at the behavior's real seam rather than once per condition, and leave out cases that
restate the type system, exercise trivially-true branches, or exist to move a coverage number. A suite
nobody can read is a maintenance cost that hides the few tests that matter.

When adding an automated behavior test, run it before implementation and confirm it fails for the missing
behavior. Use the smallest relevant test command; no full verification or separate red commit is required.
Skip this when the approved evidence is manual, rendered, static, or an existing failing test. Write any
evidence limitation as feedback on the task. Block on a plan contradiction or when required evidence
cannot be produced without new scope.

## Target

$ARGUMENTS
