# Harness² and idle-harness compared

*20 October 2026. Harness² is Google Research's framework for recursive self-improvement of an agent harness on an open stream of tasks: [arXiv 2610.14224](https://arxiv.org/abs/2610.14224) (Xu et al., submitted 9 October 2026) and [google-research/harness2](https://github.com/google-research/harness2) (Apache-2.0). Read from the abstract, the HTML paper and the README. The paper's cost figure and part of its appendices could not be read, so its costs are given here only as far as the visible text states them.*

Both projects answer the same question: how does a harness get better at work it has not seen, when nothing at test time says whether an answer is right? Harness² answers it inside each task, by re-running the task with candidate edits and comparing the runs. idle-harness answers it across tasks, by recording what each task cost to reach a solution the human approved and how the human rated it, and keeping the parts of the harness that paid.

## How Harness² works

**Per task: propose, probe, compose.**

1. **Reference run.** The current harness runs the task once. The run shows how the harness behaves, not whether its result is correct.
2. **Propose.** An editor writes two candidate edits to the harness: an *invariant* one, aimed at a general agent weakness such as planning, tool use, context or delegation, and a *domain* one, aimed at the knowledge and procedures of the task's field.
3. **Probe.** Each candidate runs the same task with the same model and environment. Its run is compared with the reference. The comparison shows whether an edit fixed what it aimed at, changed nothing, or made things worse.
4. **Compose.** A composer merges the edits the comparisons support, adopts one, or keeps the current harness. Each decision has to cite something it observed. The composed harness then runs the task and produces the answer.

With a larger budget *k*, the step runs *k* times in parallel, and an agent picks one of the anonymised results, or *k* times in sequence, each step building on the last. The authors say the comparisons guide the edits but do not verify them: runs vary, and the judging model may share the editor's blind spots.

**Across tasks: a library.** After each task, the adopted harness is stored with an `EXPERIENCE.md`: the situation it suits, the lessons, and the evidence for them. A lesson is kept only when a comparison supported it. **Every new task starts from the base harness**, not from the last adopted one. The library only informs what the editor proposes and how it composes. Later tasks adapt more than they copy: only 10–22% of modified files keep half their lines from a library entry.

**What can change.** Eight files mounted into an existing harness, OpenCode or Codex: system prompt, guardrails, memory, skills, tool guidance, scripts, subagents and a plugin. The agent loop itself is the executor's and stays fixed. The split follows AHE's and adds one component.

**Results.** A single step (*k* = 1) improved all four model and harness combinations. The gains reached 11.5 points on WorkBuddy-Bench, 4.5 on JobBench and 11.8 on LAB's partial pass rate. With *k* = 5 in parallel, a further 3–4 points on WorkBuddy and JobBench, and 2.6–6.7 on LAB. For example, Gemini under OpenCode went from 72.4 to 77.5, then 80.8 on WorkBuddy.

The ablations, for Gemini under OpenCode at *k* = 1:

| Variant | WorkBuddy | JobBench |
|---|---|---|
| Harness² | 77.5 | 36.0 |
| without the library | 74.4 | 34.2 |
| without scoping edits to a weakness | 74.6 | 32.3 |
| without composition | 75.9 | 34.1 |

Editing directly, with no reference run, probes or library, did much worse: Code fell from 73.4 to 63.2, and Web from 69.9 to 65.0.

**Cost.** No dollar or token totals appear in the visible text. Each task takes at least four runs at *k* = 1 (reference, two probes, the composed run) plus the editor and composer sessions, and the authors say a larger budget adds inference cost. Tool calls per task changed little: from 20.0 to 17.8 on WorkBuddy, 27.4 to 32.8 on JobBench, and 20.8 to 25.2 on LAB.

**Limits they report.** The gains do not show that an adopted change transfers to a different task. Transfer across models varies widely: GLM-5 gained 17.3 points on Code, Gemini 3.7 Flash 0.3. Recursion does not close the gap between the two executor harnesses. On LAB, Meta-Harness leads for Gemini under Codex.

## How idle-harness differs

| | Harness² | idle-harness |
|---|---|---|
| Where the signal comes from | Paired re-runs of the same task, compared by a model | Real outcomes across many tasks: cost to the human's approval, the human's rating |
| Who benefits from an improvement | The task at hand, refined before it answers | Later tasks; the task at hand gets the harness as it is, plus what its own session builds |
| What later tasks start from | The base harness, drawing on a library | The latest version of the harness: v1, v2, v3, specialising |
| What may change | Eight text and configuration files; the loop is fixed | Anything in the harness folder, including the turn itself (control flow, context) and tools as code |
| What it builds | Better prompts, skills, guidance, subagents | Sensors and simulations that let the agent see the result of its work |
| Cost per task | At least four full runs, plus editing | One run, plus an improvement session now and then |
| How it is judged | Benchmarks with verifiers, after the fact | The human's rating on real work; hidden tests only to check the engineering |

## What each approach buys, and what it costs

**Re-running the task gives clean causal evidence, at a price.** The same task, model and environment differ by one edit, so the effect can be attributed. The evidence arrives at once, needs no labels, and improves the task at hand. In exchange, every task costs several times as much. It only works where a task can be re-run without side effects: not a deployment, a sent message, or anything the human is part of. And the comparison is judged by a model that may share the editor's blind spots.

**Real outcomes measure the actual goal, slowly.** idle-harness measures what matters, the human's approval and rating, at the cost of one run per task, and what it learns compounds. But the signal is slow, noisy and confounded, because no two tasks are alike. Its own evals show it. In E12 the difference in cost between structures was smaller than the noise between identical runs. And in E16 to E19, sessions closed every loop whose feedback arrived within them, so the platform loop's value is not yet shown.

**Starting every task from the base prevents drift and gives up compounding.** One task cannot reshape the harness for the next, nothing accumulates unread, and the approach suits varied work. But no harness ever becomes the one that knows a particular kind of work.

**A cumulative harness compounds, and drifts.** idle-harness specialises across versions, but nothing pushes back on growth. In E12 improvement only ever added parts and never removed one.

**Fixed slots make changes comparable; a programmable turn makes them powerful.** Harness²'s eight files give every change a known place, so changes can be compared and carried between harnesses. idle-harness lets a harness change how each turn runs: when it checks, how it fits its context, which sensors run without being asked. That is more expressive and riskier, which is why its base loop cannot be broken and every version is kept.

## What idle-harness takes from Harness²

1. **Paired evidence, made cheap.** idle-harness's planned replay of a single recorded turn is the inexpensive form of Harness²'s probe: the same moment with and without a change. Build it, and allow a full re-run only where a task is sandboxed and cheap, so a change gets attributable evidence before dozens of tasks have passed.
2. **Every change says whether it is general or domain-specific.** That separates what can carry over to another harness (intent I8) from what specialises this one. It belongs in the change declarations still to be built.
3. **Evidence gating.** A change, or a lesson, is kept only when it cites concrete records: turns, outcomes, a replay. This is stricter than what the improvement session is asked for today.
4. **The library, tested as a structure.** Next to the cumulative harness, test a harness that starts each task from its base and composes from adopted pieces, on a real stream of work, by cost to approval and rating.
5. **A known place for every change.** Use Harness²'s eight slots as a starting layout for the harness folder, with `turn.ts` as idle-harness's addition (intent I5).

## What idle-harness keeps

- **The human's approval and rating as the signal.** A model's judgement can share the agent's blind spots, and only the human knows what was wanted.
- **Cost as a first-class number.** Harness² publishes none.
- **A turn the harness owns.** It is the place where sensors run without being asked and where the context is managed.
- **Sensors and simulations as the core.** Harness² improves how a model works inside a harness. idle-harness is about closing the loop when a task leaves information out.
