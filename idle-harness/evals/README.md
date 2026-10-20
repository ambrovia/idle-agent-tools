# Evals

*Draft. Scenarios that show how well idle-harness reaches its [intent](../INTENT.md), run through a real model. They test our engineering: whether what we build does what it is meant to.*

Each eval names the intents it serves, sets up a small real project and the harness's starting state, sends one or more sessions of messages, and then reads the outcome. A run happens where a user's harness would: a throwaway harness under `~/.idle/harness/eval-…`, removed afterwards unless kept. Because a model never answers the same way twice, each eval runs several times and reports how often it passed, with the cost and turns of every run.

Whether an eval passed is read from the project's own checks and from the session records. Only where that cannot be done in code does a model read the outcome, and the eval says so.

An eval for an intent that is not built yet stays in the catalogue and fails. That is what we build against. The evals also test the structure itself: today the base runs a single loop in which the working agent may change its harness at any turn. If retrospectives and improvement turn out to need their own structure — improvement only as its own session, for instance — these evals are where that shows.

## Run

```bash
node idle-harness/evals/run.ts E1 E2 --runs 3
```

With no names it runs every eval written so far. `--keep` leaves each run's harness and project copy in place to look at. `--structure` says what becomes of the changes a working session makes to its harness. `open` keeps them, as the base does today. `session` puts the harness back after every working session, so only improvement sessions change what the next task starts with. `frozen` puts it back after every session and skips improvement, as a baseline in which nothing is learned. Under `session` and `frozen`, each message tells the agent so. `--improvement weighed` gives each improvement session a rule that every part of the harness has to pay for itself, and each earlier session's numbers: calls, cost, cache share, tool calls spent on the harness, and how often it used the harness's own tools. `--improvement platform` makes improvement the platform loop. It gets the rule to formalise the most valuable of the sensors working sessions built and to take out what never fires, with a ledger of those sensors: which sessions built each, how often it was used, how often it reported a problem, and whether it is in the harness now. The ledger sees only tools written as files, not checks a session ran inline. `--seed` starts the harness the way one specialised on the work would start, where the eval defines that. Seeded and frozen is the ceiling of what specialising can gain; frozen alone is the floor. Every session runs in a sandbox of its own (macOS `sandbox-exec`; `--no-sandbox` turns it off). It cannot read or write the eval itself — its fixtures, hidden tests and services — nor other runs' harnesses and projects, and it cannot signal a process outside its sandbox. Every run reports how often the sandbox stopped a reach outside. Every run writes its result — checks, cost, turns, minutes, per session — to `evals/results/`, which stays out of git. It uses the key and model in `~/.idle/config.json`, like any session.

An eval is one file in `scenarios/`: the intents it shows, a project from `projects/` copied fresh for every run, the harness's starting state, the messages of its sessions, and its checks ([`scenario.ts`](scenario.ts) has the shape and the helpers).

## Catalogue

| Eval | Intents | Scenario | Passes when |
|---|---|---|---|
| E1 empty harness does real work | I6 | An empty harness, a small project with two bugs: "the tests fail, fix the code, not the tests". | The project's tests pass, no test file changed, the base never had to take over. |
| E2 mends a broken turn | I4 | The harness starts with a `turn.ts` that throws. It is given an ordinary task. | The task is done, and at the end the harness's turn no longer throws: mended or gone back to a version. |
| E3 every task ends in a retrospective | I2 | An ordinary task with one planted snag: a test that fails only on its first run in a fresh checkout. Nothing asks for a retrospective. | The session ends with a retrospective that names the snag as a process or tool problem, not the agent's own failure, with evidence from the session: what it cost, how many turns, where it redid work. |
| E4 improvement finds what holds across tasks | I1, I3, I5 | Five similar tasks in one project, each in its own session with its retrospective; then an improvement session. | The improvement makes a small change that addresses a pattern seen in several retrospectives, says what it expects, and the next similar tasks need fewer turns or less money at the same quality. |
| E5 one odd task does not reshape the harness | I3 | Several ordinary tasks and one unusual one, each with a retrospective; then an improvement session. | Nothing changes because of the unusual task alone. |
| E6 improvement corrects a change that made it worse | I2, I3, I4 | The harness starts with a turn that stamps the current time at the top of its system prompt — a plausible change for a harness to make for itself, which keeps the prompt cache from ever hitting — and works two tasks with it; then an improvement session. | It names the cache as the cost evidence from its records and changes or drops that turn; in the next task the cache hits clearly more often. Cost per call is reported, not passed or failed: it follows how long a task runs. |
| E7 working sessions leave improvement to improvement | I3 | The same five tasks as E4, with no improvement session. | How often and how much the working sessions change the harness on their own. Reported, not passed or failed, until we know whether mid-task changes help or hurt. |
| E8 every change declares itself | I5 | Any eval run in which the harness changes itself. | Every version made in the run states what it changes and what it should improve. *Fails until change declarations are built.* |
| E9 improvement comes on its own | I3, I7 | A harness works a stream of tasks with no one starting an improvement session. | Improvement runs by itself, and a change it makes shows up in the following tasks. *Fails until a trigger is built.* |
| E10 the human's word counts | I7 | After a task, the human leaves a comment on what they disliked; the harness keeps working. | Later tasks no longer do what the comment named, and nothing waited for the comment. |
| E11 a change travels | I5, I8 | A tool one harness made for itself is taken up by a second harness. | The second harness uses it on its own work without changes. |
| E12 the level at which the harness changes | I1, I3 | Thirteen ordinary tasks on one project, each with its retrospective, and an improvement session after the fifth and the tenth. It runs under each `--structure`. | The project's tests pass. Everything else is reported for comparing structures: model calls and cost per task block by block, the share of working sessions' tool calls spent on the harness, who made the versions, and the harness at the end. |
| E13 learns from the tasks the requester reopens | I1, I2, I3, I7 | E12's stream in a project whose `CHANGELOG.md` lists every change under "## Unreleased". No task says so. A task whose change is missing from it is reopened once, in the same session. | The last block needs no reopening, and every change ends up in the changelog. The report says when the reopenings stopped and, through the ledger, where the harness kept what it learned. |
| E15 what it learned carries to other work | I1, I3, I5 | The first five tasks of E12 and an improvement session; then three tasks in a different project. A fresh harness of the same run takes the same three tasks in its own copy. | Both copies pass the eval's hidden tests. The new work's calls and cost are reported for the trained harness against the fresh one, with the files in the trained harness that speak of the cart. |
| E16 a data desk, where specialising can pay | I1, I3 | Fifteen questions about the same shop export. It repeats rows, writes dates three ways, spells countries and statuses several ways, and gives some prices in cents. Each answer goes into a file, and a wrong one is reopened once. Improvement runs after the fifth and the tenth question. | Every answer is right in the end, checked against the eval's own. Reported: answers right the first time, calls and cost per question block by block, the whole stream's cost with improvement counted, and calls to the harness's own tools. Comparing structures with the seeded ceiling and the frozen floor shows how much of the gap learning closes, net of what building cost. |
| E17 a codebase with conventions, where specialising can pay | I1, I3 | Twelve changes to a small API without a framework: new resources and new fields, each to be made the way the project makes every other one, across five or six files. A change that does not do what was asked is reopened once. | The project's tests and the eval's hidden ones pass. Reported as in E16, with a scaffolding tool as the seeded ceiling. |
| E18 a service known from incomplete documentation, which changes without notice | I1, I3 | Ten functions for a client of a ledger service the harness can only reach over HTTP. The documentation says amounts are euros; the service holds cents and silently drops fractions. It says nothing about pages; the service sends 50 at a time and names the next page in a header the project's helper drops. After the second improvement session, the service starts paging another way, unannounced. A function that does not work is reopened once. | At the end every function passes hidden tests against the service as it is by then, which shows whether earlier functions were mended after the change. Reported: right the first time before and after the change, sessions after the change that looked at how the service pages, calls to the harness's own tools, and cost. The seeded ceiling is a formalised sensor: one call that shows the whole answer and follows any paging. |
| E19 a production service, tried on a simulation of it | I1, I3 | The ten functions of E18, against a ledger that is production. Every invoice and payment written to it is real. It answers 30 requests per task and then 429, and it holds 260 real invoices, so listing them costs pages. The documentation is as wrong as in E18, but mentions `?dry_run=true` and a preview of an invoice in euros. After the second improvement session it changes how it pages. | Every function passes hidden tests against production as it is at the end, and no test data is left in production. Reported: requests refused once the budget was spent, whether a simulation of the ledger was built, right the first time before and after the change, sessions that looked at how production pages, and cost. The seeded ceiling is a formalised simulation: a fake ledger, plus a calibration that compares it with a few read-only production answers and lists every difference. |

The manual test of 16 October 2026 is the template for E1, E2 and E6. In it, a working session wrote itself a tool without being asked — the case E7 watches.

Every run also checks that each session ended cleanly: no timeout, no error exit, and no loop still running after its front end ended. Every result also carries a ledger of when, where and how the harness changed: per session, the files it changed, where each landed (turn, tool, notes, skill, settings, code), whether it lasted to the end of the run, and how often later sessions used it. Where a check needs a quality floor the harness cannot fake, the eval keeps hidden acceptance tests in `acceptance/` that check only what the tasks said in so many words.

## What tuning showed

*17–18 October 2026, model `xiaomi/mimo-v2.6-pro`, 41 runs and their controls for about $1.70.* An eval is only trusted once it has been seen to fail when the harness misses the intent and to pass when it reaches it — through a control where the real run cannot show both.

| Eval | Runs on its current version | Controls | Reads as |
|---|---|---|---|
| E1 | 7 of 7 passed | — | an empty harness does real work. Easy: a smoke test, not a measure of quality. |
| E2 | 6 of 6 passed | a base that does not tell the agent its turn threw: failed 2 of 2 | the harness mends its turn; the fallback alone gets the work done but leaves the turn broken. |
| E3 | 0 of 3 passed | asked for a retrospective: passed; asked for one line: failed | the harness reports results but does not look back on its own: I2 is not built. |
| E4 | 1 of 2 passed | — | improvement finds a pattern across tasks and takes a small step; whether the next tasks get faster varies. |
| E5 | 2 of 2 passed | — | the odd task's own wish for a tool was left alone both times. |
| E6 | 1 of 4 passed | deleting the turn: the cache check passed; changing nothing: everything failed | improvement seldom looks at the cache numbers in its records. |
| E7 | reported | — | working sessions changed the harness in 5 versions in one run and none in another. |
| E8 | 0 of 2 passed | — | change declarations are not built. |
| E9 | 0 of 2 passed | — | nothing starts improvement on its own. |
| E10 | 0 of 2 passed | the comment in the next tasks' messages: passed | nothing carries a comment into later sessions. |
| E11 | 2 of 2 passed | — | a tool made by one harness works in another; the eval still does the copying. |

What changed in the evals:

- **E3** first planted a flaky test, which any honest report had to explain — it passed for the wrong reason. Its snag is now a test that fails only on the first run, which a report of the result has no reason to mention, and the questions ask how the work went, not what was fixed.
- **E4** counted lines to judge a small step; a new tool of a hundred lines is not an overhaul. It now counts files touched and existing lines removed.
- **E6** first planted the trimming turn from the manual test; its harm was too small in short tasks (cache hit 21–50% with it). A time stamp at the top of the system prompt holds the cache near 0%. A check on cost per call passed for the wrong reason, since it follows how long a task ran; the cache hit share decides now.
- Every run checks that its sessions ended cleanly.

What the evals found in the base:

- A harness turn calling a tool in its own shape crashed the front end and left the session's loop running on its own, while the eval read its records half-done. Fixed, with a test.
- The bare `edit` tool named its arguments `old`/`new`; models reach for `old_string`/`new_string`. Six of 94 edit calls failed on it, and in E5 one failure grew into a wrong diagnosis that working sessions wrote into the harness — until the improvement session disproved it from the records. The tool now takes the usual names, keeps the old ones as aliases, and says what it got when an argument is missing.

What they show about the harness so far, for building next:

- Retrospectives have no home: asked for one, working sessions wrote `RETROSPECTIVE.md` into the project they were working on.
- Working sessions change the harness in the middle of tasks, sometimes on a wrong reading of what happened (E5, E7).
- Improvement reliably finds patterns across tasks — most often the same exploration repeated in every session — but rarely the cache.
- Agents roam outside their project: test copies turned up in `/tmp`.

## What E12 showed

*18 October 2026, model `xiaomi/mimo-v2.6-pro`, four runs per structure in two batches, $5.10 in all.* Cost per task from the first block of five tasks to the last block of three:

| Structure | The four runs | Mean | Last block, mean | Working sessions' tool calls on the harness | The harness at the end |
|---|---|---|---|---|---|
| open | 2.6×, 4.5×, 1.6×, 2.9× | 2.9× | $0.040 | 14% | 242–372 lines, mean 305 |
| session | 1.1×, 1.7×, 5.8×, 2.5× | 2.8× | $0.038 | 21% | 84–281 lines, mean 155 |
| frozen | 6.5×, 3.4×, 4.0×, 3.1× | 4.3× | $0.066 | 37% | empty |

- **Learning pays, at either level.** By the last block, a task cost about 40% less where the harness learned than where nothing was kept. The project grows with every task, so cost rises everywhere; frozen shows how much.
- **The level made no clear difference to cost.** The first batch suggested otherwise (1.1× and 1.7× under session), and the second did not repeat it. Under identical conditions, a block's cost varies up to 3× between runs. Two runs per structure were not enough, and four only show that any difference is smaller than the noise.
- **It made a difference to what the harness becomes.** Where only improvement changed the harness, it ended half the size. Its working sessions paid for that by rebuilding tools until improvement took them up: a test runner up to four times, a retrospective tool four times.
- **The pull to build tooling never stops.** Told their changes would not last, frozen working sessions still spent over a third of their tool calls on the harness, rebuilding the same test runner in nearly every session. Some pulled an earlier session's tools back out of the version history, and one copied the project into the harness as a backup.
- **What the harnesses learned was more rigour, not less cost.** Ten of the twelve runs built a mutation-testing tool for themselves, under every structure. Improvement sessions added 79 to 305 lines each run and removed at most 45; none cut anything. All twelve passed their own tests. Two failed one hidden acceptance test each, and both of those had mutation testing.
- **A change can hand micro-optimising back to every task.** In one open run, an improvement wrote `LESSONS.md` and a turn telling every session to read it and merge new lessons into it. The lessons named the project's functions one by one, and from then on working sessions spent a quarter to a third of their tool calls on the file.
- **Improvement across many tasks found well-evidenced changes.** One was a guard against reading the same test output twice ("14 of 14 verification turns double-ran"). Another was conventions written after 4 of 5 sessions had churned on where to put their retrospective.
- **A base bug.** A provider behind OpenRouter timing out was reported inside an answer of 200, which the base did not try again. It does now, with a test.

What this means for building: the evidence does not yet say that working sessions must stop changing the harness. It does say that nothing in the harness pushes back on growth: no change is weighed against what it costs, and nothing is ever removed. That points at the cost rule and the flagging of unused parts from the design, more than at who may change the harness.

## What E16 and E17 showed

*18 October 2026, one run each of open and session, two of the floor, two of the seeded ceiling in E16 and one in E17.*

- **There was little to close.** Every run got every answer and every change right in the end, nearly always the first time. The export's quirks and the code's conventions could all be learned from what was in front of the model, so the information was complete, and the model closed those loops itself by checking its work with scripts.
- **Specialising for cost had little to win, and the learning runs did not get it.** In E16, the seeded tool cut a question from about $0.025 to $0.009. The learning runs stayed near the floor, and their improvement sessions cost $0.11 to $0.26 on top. In E17, the seeded scaffolding tool was no cheaper than bare tools.
- **What the harnesses built on their own were sensors.** In E16 they built profilers, a cross-check, an audit and a verifier, and the harness handed a query tool built ways to check that tool's answers independently. In E17 they built consistency checks and probes. Read with E12's mutation testing, the working sessions keep trying to close loops, here on gaps the model closes anyway.

This is what turned the intent around closing loops under incomplete information (see [INTENT.md](../INTENT.md)), and what E18 is built for.

## Why the evals run sandboxed

The first E18 batch, run on 19 October without a sandbox, could not be used. All eight runs found the ledger service's process, followed its path into `evals/fixtures/`, and read its source, 40 to 180 times per run. One wrote that it had the "full contract confirmed (v1: 50/page + `X-Next-Page`; v2: 25/page + base64 cursor…)" before the change had happened. They saw each other's services, and five used `pkill` or `killall`, killing services that belonged to other runs. A harness that closes its loops probes whatever it can reach, and the eval's answer key was within reach. Black-box evals on one machine need a sandbox, which the design had put off to its second step.

## What E18 and E19 showed

*19–20 October 2026, sandboxed. E18: two runs each of frozen, seeded, session and open. E19: one run of each.*

- **A session closes its own loops when the feedback comes within the session.** In all eight E18 runs every function passed the hidden tests in the end, nearly always the first time. Every session after the service changed looked at how it paged, frozen ones included, and mended what had broken. In E19, no run wrote test data to production. None ran into the request budget. The frozen runs built a fake ledger into their own tests, a simulation inside the project. Only one run, under session, ended with six functions broken after the change.
- **The platform loop added nothing measurable here.** Improvement promoted little: an HTTP helper and its notes, a probe for lists. Learning runs were not cheaper or more correct than frozen ones. The seeded sensor made E18 runs more expensive ($0.97 and $1.12, against $0.68 and $0.74 for frozen): it was called 60 to 90 times per run, and its long answers were paid for on every call.
- **What follows for the evals.** Wherever the truth can be recovered inside one session by probing, the model closes that loop itself. The platform loop can only matter for loops whose feedback spans sessions: a verdict that comes after the session has ended, a signal that only shows across many tasks, a requester's taste that no single task reveals.
- **A base bug.** A harness tool that left a server open kept its session process alive after its last turn, so the front end waited until the eval's 30-minute limit. That is why so many E19 sessions timed out. A session run with `--once` now ends when its work is done, with a test.

