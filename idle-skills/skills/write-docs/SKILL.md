---
name: write-docs
description: "Write or review user-facing documentation when it is an explicit deliverable or when an implementation makes authoritative documentation false. Preserve project voice and factual accuracy; use reading-funnel craft proportionately to page type."
persona: pipeline-builder
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Write docs

Run only for a task whose goal is documentation, requested docs work, or concrete staleness caused by the
change. Do not turn nearby documentation improvement into current scope. `{{rules.docs}}` from
`pipeline.config.yml`, the existing docs under `{{paths.docs}}`, and established voice take precedence.

Verify names, behavior, commands, paths, defaults, and examples against the code. Preserve accurate
existing material and author voice. Organize for the page's reader: state the value or task early,
progress from essentials to detail, use clear headings, keep paragraphs focused, and end task pages with
an actionable next step when useful.

Treat funnel, visual-density, activation, and anti-slop principles as craft guidance, not a universal
score. A reference correction need not become a tutorial; a guide need not become a product page. Avoid
invented claims, generic promotional prose, mechanical quotas, fake quotations, and examples that do not
run.

Review blocks only on factual errors, broken instructions, violated configured rules, or failure to reach
the task's goal. Report optional editorial improvements separately.

## Target

$ARGUMENTS
