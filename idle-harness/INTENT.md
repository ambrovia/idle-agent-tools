# Intent

*Draft, 17 October 2026, rebuilt on 19 October around closing the loop. What idle-harness is for, in Tobi's words from the design conversation. Everything we build is measured against this. The evals in [`evals/`](evals/README.md) describe, scenario by scenario, how each intent looks when a harness reaches it through a real model; how well they pass is how well the engineering works.*

idle-harness is a personal research project. The output is learnings and blog posts, not a product. It is built for "realistic work, not an academic experiment": its evals are real tasks in real projects, settled by those projects' own checks, never a benchmark.

## What it is for

When an LLM builds something open-ended whose result is hard to check, the quality varies wildly. Models keep getting better at the skills themselves and need less guidance for them, "but no model performance can ever solve the problem of incomplete information. And that's where building a closed loop harness comes in." A harness that closes the loop builds its own tools to see the result of what it does, so that "even in case of incomplete information the LLM as the controller of the closed loop will balance itself at the optimal position." "The goal of this harness is to build a system that becomes robust to incomplete information."

Sensors are one part of it. "Wherever you cannot change directly you need a model to do model based control. That's a simulation." Where the harness may not try things on the real thing — a production system, a budget, a human's time, feedback that comes late — it builds a model of that reality to try them on: a fake of a service, a copy of an environment, a model of what the requester will accept. A model is worth only as much as it matches: "constantly measure sim to real to sim".

It does that in two loops, the way engineering does. The feature loop is a working session doing the domain work and building, as it goes, the sensors it needs. The platform loop is improvement: from all those sensors it "finds those that are most valuable", and they "become formalized" in the harness the next sessions build on. "That is a similar concept of these two loops and that's what we want this harness to self learn."

## I1 — It closes its own loops

A working session does not hand in what it could not check. Where it cannot see the result of its work — no test covers it, a system it depends on cannot be read, the requester's wishes were never written down — it builds a way to see it: a check, a probe, a measurement, a question to the human. Where it may not try things on the real thing, it builds a simulation of it to try them on, and checks the simulation against the real thing whenever it can. Then it steers by what it sees. Anything in the harness may change for this: "anything is allowed to change", down to its inner structure.

*Reached when:* with information withheld from its tasks, a harness builds sensors that recover it, and where the real thing may not be tried on, a simulation it checks against the real thing; and its results land close to what was actually wanted — closer, and with less spread from run to run, than a harness working open loop.

## I2 — It looks back on every task in a retrospective

After a task, the harness looks back at what happened, in the same session or with access to it, so the insight comes from the session itself. A misstep is not the agent's failure but a sign of a wrong process or a wrong tool. Above all, it looks for the open loops: where it acted without being able to see the result. The retrospective records both kinds of evidence: what it felt like — redo, iterations, friction — and what it measured — cost, turns, and a quality floor it cannot fake: the checks, the review, whether the task was reopened. "Since we are building specialising systems and not general purpose running against any benchmark is worthless": this is how it knows how it is doing.

*Reached when:* every task ends with a retrospective that names the process or tool behind what went well or badly, backed by the session's own evidence.

## I3 — It improves across many tasks, not within one: the platform loop

Improvement is its own task, in its own session, in the same harness — separate from the work and from the retrospectives. It reads the evidence of many sessions, qualitative and quantitative, and changes how the harness works only where that evidence holds across them. Much of what it finds are the sensors working sessions built for themselves. The ones built again and again, used often, and that caught real errors become formalised: a stable tool with checks of its own and a stated purpose, and where it pays, part of the turn, so that it runs without being asked. The same goes for simulations: the platform loop keeps them, measures how far each is from the real thing, and mends one that has drifted. A sensor costs something on every task it runs, so it stays only where it pays, and what never fires is flagged and taken out. Each task moves the harness only a little: small steps, not an overhaul after every task, so the harness does not micro-optimise for the last thing it did but improves across all of it.

*Reached when:* the sensors it formalises are the most valuable by the evidence of many sessions; once they are formalised, the work's error and its spread go down, and a change in conditions is noticed at once; its simulations stay close to the real thing, and a gap that opens is found and closed; one unusual task does not reshape it; and the harness can tell from its own records whether a change made it better or worse, and acts on that.

## I4 — Missteps are recoverable; it cannot break itself

"There needs to be a baseloop that cannot be broken by the agent itself." "Worst case the agent still sees versions of himself and can himself rollback. This is both safety net, but even more so the true substrate."

*Reached when:* a harness that breaks its own turn or tools still gets its work done, notices, and mends itself or goes back to an earlier version.

## I5 — Changes have a structure

"A certain level of structure where and how changes" happen, so that specialisations stay comparable and transferable between harnesses. Every change says what it is for.

*Reached when:* each change lives in a known place — turn, tools, settings, skills — states its reason and expected effect, and can be read, compared and carried over to another harness.

## I6 — Simple, and an empty harness works

"Everything needs to earn its keep." A new harness is an empty folder and does real work from the first message, with the bare tools alone.

*Reached when:* an empty harness completes ordinary tasks, and every part of the base can be pointed at an intent it serves.

## I7 — The human advises; nothing waits

Human in the loop is "advising / async", not blocking.

*Reached when:* work, retrospectives and improvement go on without approval, and what the human says afterwards changes what the harness does next.

## I8 — Several harnesses

Several harnesses from day one, each closing the loops of its own work, able to talk to each other and to be switched between. A harness can be packaged and carried elsewhere.

*Reached when:* two harnesses on different kinds of work grow apart, can hand each other work, and one's useful change can be taken up by the other.

## Not the intent

A general-purpose agent. A product. A benchmark score. Self-improvement as an academic result. Guidance for skills the models already master on their own. Making tasks cheaper for its own sake: cost is a signal a sensor has to pay its way against, not the goal.
