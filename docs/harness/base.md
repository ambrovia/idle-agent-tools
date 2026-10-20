# Specialising harness — the base

*15 October 2026. Draft, third pass. A personal research project: harnesses that specialise themselves by working, down to their tools and how a turn runs. The output is learnings and blog posts, not a product. This page is the base everything else builds on, in plain words. Research behind it: `reports/Self improving agent harnesses.md` and `research_notes/Harness internals/`.*

## What it is

A tiny harness of our own, kept minimal the way pi and idle-tasks are: everything has to earn its keep. You create as many harnesses with it as you like. Each one starts empty, does tasks, and changes itself as it learns what makes its work cheaper and better. A harness may define several agents and uses subagents like any other harness.

One service runs the harnesses, as a daemon: always there in the background, whether or not a front end is open. Agents keep going, improvement recurs, and a harness can give itself a routine, such as waking every day at 8. The TUI is its first front end and a desktop app the second; both are the same functionality with a different surface.

## How it works

**A harness is a folder.** It lives in user space, `~/.idle/harness/<name>/`, and holds its configuration (which plugins and MCP servers it uses), its skills, the code for its turn, and whatever files that code needs. There is no project level: a harness for one project is just another harness. A new harness is an empty folder and still works, because the base supplies the bare tools: read, write, edit, bash.

**What a harness is made of.** Three kinds of thing, not a fixed list of files:

- **Its own code:** `turn.ts`, how each turn runs, and `tools/<name>.ts`, its own tools — the sensors, simulations and helpers it builds.
- **What it hands to the base's building blocks:** its skills, its memory and its subagents. Skills are its library: ways of solving a kind of problem, each with when it applies and the records that showed it working; only a skill's description is always present, the rest loads when a task needs it. Memory is a building block, and idle-tasks keeps the memories shared beyond one harness.
- **Its settings,** in `config.json`.

What is always loaded is paid for on every turn; what loads on demand only when used. Improvement decides which is which: a part that fires on nearly every task belongs in the turn or the tools, one that fires rarely belongs in the library. Guardrails are not a part of the harness: holding back a harmful change is the second step's auto mode.

**Reuse comes from plugins,** and only from the portable pieces: SKILL.md skills and MCP servers. A harness never changes a plugin, the base never changes, and nothing moves from one harness into another or into the base.

**The base owns the loop; the harness owns the turn.** The harness programs one function:

```
turn(context, response, arrived, base) → { context, prompt }
```

`context` is what the model is shown: the model, the system prompt, the tools and the messages. `response` is the model's last answer. `arrived` is whatever came in since the last turn. `base` is the building blocks. The function does whatever it wants in between — run the tool calls, start subagents, load a skill, reshape the context, pick another model — and returns the context and the prompt for the next model call. Returning no prompt means: wait.

```
forever:
  arrived = take from the inbox        (waits when there is no answer to hand to the turn)
  if the harness folder changed: save a version; load the folder
  try:    context, prompt = harness.turn(context, response, arrived, base)
  except: context, prompt = base.turn(context, response, arrived); note the exception
  response = model(context, prompt) if there is a prompt
  record the turn
```

**The loop cannot be broken from inside.** The harness's turn works on copies of its inputs. The base's own plain turn takes over from the originals when the harness's turn throws, returns a step that is not whole, or builds a request the provider refuses; the agent is told, once per version, so it can mend the turn or go back. A tool call that already ran in the failed turn is not run again. An unreadable inbox item or a version git cannot save is passed on as a note, not a crash. There is no time limit on a turn. A timer for background work that might be stuck is one the agent sets, never the base. The human can always abort a running call.

**TypeScript, no build step.** The base and the turn are TypeScript, run directly. Nothing type-checks the turn when it is loaded; a mistake in it surfaces as an exception, and the plain turn takes over.

**The inbox.** One per session, saved with the session. Everything that arrives goes through it, each item with its sender and time: a message typed while the agent is busy, a message from another device, a message from another session or harness, a finished background job or subagent, a timer. The turn decides when to act on an item. Abort is not an inbox item.

**Building blocks.** The base offers these for the turn to call: model call with cost; tool calls, also in parallel; subagents; background jobs; timers, one-off or recurring; send to another session; memory; the skill registry and loading a skill on demand; an MCP client; the session record; a crude context trim. Remote control and computer use come later, as further blocks. Models come through OpenRouter to start: it reaches OpenAI's models too and reports the dollar cost of every call. OpenAI directly needs a second wire format for tool calls on its current models, and a price table.

**Tools are files.** A harness gives itself a tool by writing `tools/<name>.ts`: a description, its parameters, and the function that runs. The registry is the bare tools, the harness's own, and later the tools of its MCP servers. A harness's tool replaces a bare one of the same name, except `versions`, which stays the base's. A new tool is a change to the folder like any other: saved as a version, live one turn later. A tool file that cannot be used is left out and the agent told; a tool that throws returns the error as its result. The plain turn offers the whole registry every turn; the plain turn that takes over from a broken one offers only the bare tools.

**Subagents.** A subagent is the same loop on its own session record. Which turn it runs — the harness's, another one from its folder, or the plain one — is the harness's to decide and to specialise; how subagents work best differs by domain.

**Context trimming belongs to the turn.** The turn returns the context every time, so trimming can be constant and active, and is something a harness improves. The base only trims crudely when the context would overflow. The full session record stays, so nothing trimmed is lost. Rewriting the start of the context costs cached input; that shows up in the harness's own cost.

**Who may change a harness.** Only the top-level agent, in any turn. Subagents never. The latest folder is loaded at every turn, so a change is live one turn later. Two sessions on the same harness follow the same rule; whoever finds a clash resolves it.

**Versions.** The base saves a version whenever the folder changed. They are kept in git, which the base drives silently — the agent commits nothing. Listing versions, looking at one and going back to one are base tools; going back is itself a version, so nothing is lost. That is the safety net and the substrate: missteps happen, and the harness can see its earlier selves and recover. One gap: a turn that does not throw but leaves the agent unable to act is the human's to undo, with `idle-harness restore`.

**Front ends.** The inbox is the only way in and the session record the only way out. A front end writes to the inbox and follows the record as it grows, over local HTTP.

**Sessions.** The service never runs harness code. Each session is its own process, so a stuck turn cannot freeze the others, and aborting stops that one process. One loop per session: a second front end on a running session talks to it. A turn stopped by the human is written down as stopped, its unfinished tool calls answered as stopped, so the session goes on from there instead of running them again. The inbox and timers are saved: they survive a restart, a routine missed in between fires afterwards, and a turn cut off by a crash is run again.

**idle-tasks stays as it is.** The base connects to it over MCP and sets `by` to the harness name and version, so the record of work shows which version did which task. Cost stays in the base's records, tagged with the task.

**The human** advises and can step in afterwards. Nothing waits for approval.

## What the base records

Only what retrospectives and improvement need to connect things. They do the rest.

- Per turn: the three inputs, every building-block call with its result, the prompt sent, the model's response, the harness version.
- Per model call: time, harness, harness version, task, agent (main or which subagent), model, cost in USD.
- Per version: when it was saved, in which task, and the change's declaration. Improvement adds the outcome later.
- Whether the base's plain turn had to run, and the exception.

**Analytics.** Improvement should not have to read whole sessions to see what happened. From its records the base gives a plain summary per task: where the cost and the turns went, by agent and by tool; which calls repeated or failed; how the context grew. Harnesses will want different data. A turn can add its own entries to the record, and a harness keeps its own analysis as files in its folder — it specialises that like anything else.

## How a harness gets better

**No benchmark.** A harness specialises, so it is measured on its own work, across hundreds of tasks. Task size does not matter; the trend does. This is built for realistic work, not an experiment: nothing assumes a fixed benchmark, tasks that repeat, or a split into training and test tasks.

**Three signals per task.** Cost in USD, from the base. What it felt like — rework, iterations — from the retro, written by whoever drove the task. How good it was: the checks, the review and whether it was reopened, from idle-tasks.

**Retrospective, then improvement.** Two steps, both tasks on the same loop. The retrospective comes at the end of a task, by whoever drove it, with the session at hand: what went well or badly, put down to a process or a tool, never to the agent, with the session's evidence. Improvement is its own task in its own session: the compound agent, not the one that did the work, reads the retrospectives and records of many tasks and changes the harness only where a pattern holds across them, in small steps, so the harness does not micro-optimise for its last task. Improvement recurs on its own, without human input; when it runs is the harness's to set, because different domains need different cycles. Today a working session may still change its harness at any turn; whether that has to go is for the evals to show.

**Productivity is the goal.** A change should make the work better, faster or cheaper; better includes simpler and lasting longer. A change is kept when it improves one of these without making the others worse by more than the noise. A trade-off has to pay for itself.

**Every change declares itself.** One mechanism per change, so its effect can be told apart from the others. The agent states what friction it answers, what it changes, what it expects to get better, and whether the change is general — about how an agent works, so it could carry over to another harness — or about this harness's domain. It cites the records it rests on: turns, outcomes, replays. A change or a lesson that cites nothing is not kept. The base keeps the declaration with the version. Improvement later writes the outcome next to it — kept or undone, and what the signals did — and so scores the predictions over time.

**Unhelpful parts are flagged, not deleted.** A part that has not paid off for a while is flagged. Removing it is a normal change and goes through the same steps.

**Running it again.** A change is tested by running a piece of recorded work again with it, against the same piece with the harness as it was: paired evidence, the same work differing by one change. Three sizes, cheapest first:

- **A turn.** The changed harness gets the same three inputs, builds its prompt, and the model is called once. Tool calls come from the record, so nothing runs for real. It shows whether a change alters the next move.
- **An episode.** From a recorded point — the start of a sub-goal, the turn before a failure — the changed harness works on until that sub-goal is reached or fails. That needs the project's files as they were, so the base snapshots the working directory at turn boundaries.
- **A task.** The whole task again, in a container where side effects do not matter.

Running again also serves the task at hand: a harness can try candidates and keep the better result. Every run costs, so how much of it a task gets follows what the task is worth. Improvement says beforehand what should be different. Moments that went well are run again too, to see that a change did not break them, and running one moment several times with the unchanged harness shows the noise a change has to beat.

## Second step

**Auto mode.** A judge model reads each change to a harness before it is loaded and holds back one that leaks the checks or their answers, does nothing, removes a safety step, games the checks or the retro, bundles changes it did not declare, or can loop without end.

**Sandboxes.** Standard support for running a harness's commands in a sandbox. Until then the loop is safe from mistakes, not from `rm -rf`.

## Deliberately not in the base

No project-level config. No approval gate. No watchdog. No spending cap; the providers have their own. No manager above the harnesses. No replay of more than one turn, which would need the files as they were.

## Open

1. How the service starts and comes back after a reboot.
2. Which improvement cycles work: nightly, a number of tasks, a bad signal. To be found by trying.
3. What the plain per-task summary shows.
4. How the agent hands the base a change's declaration.

## Built so far

`idle-harness/`, about 750 lines, no dependencies. `idle-harness chat <harness>` talks to a harness and creates it on first use.

- The loop, the plain turn, and a harness's own `turn.ts`, loaded again with every file it imports when the folder changed; copies in, a checked step out, the plain turn taking over on a throw, a step that is not whole, or a refused request.
- The bare tools, and `versions` as a fifth: list, show, restore. Also `idle-harness versions` and `idle-harness restore` for the human.
- Tools as files in the harness's `tools/`, joining the registry one turn after they are written.
- Versions in git, one repository per harness folder, out of reach of the user's own git config.
- The record and the inbox as plain files under `<harness>/.sessions/<session>/`: `record.jsonl`, writing only the messages after each turn's shared start, and one file per inbox item. The front end only writes the one and follows the other.
- Each session as its own process with a lock: one loop per session, a second front end talks to it, a stopped turn is written down as stopped, and a session picks up where its record ends.
- Model calls through OpenRouter with no time limit, and the cost of each turn, extra model calls included. The key and the default model live in `~/.idle/config.json`, which is never versioned; the environment overrides them, and a harness can name its own model in its `config.json` or per turn in the context.
- Commands a harness runs carry `IDLE_BY=harness/<harness>@<version>`, so the `idle` CLI stamps the record of work. A job a command leaves in the background runs until the session ends.
- A session can be started for an idle-tasks task (`--task`), which every record entry then names. `idle-harness stats` reads, from the records, what each task took — from the task a session was started for or the one it claimed, until it submits — and every version of every tool a session built, with its build cost, uses and the problems it reported. The design is in [analytics.md](analytics.md).
- A context past its limit (`contextLimit` in the harness's or the user's config, or `IDLE_HARNESS_CONTEXT`) is fitted crudely: the oldest tool results become pointers into the record, and the agent is told once. The smarter default the [compaction report](../../reports/Context%20compaction%20in%20agent%20harnesses.md) recommends is next.
- A session run with `--once` ends when its work is done, even when a tool left a server open.

Not built yet: the service itself and HTTP, the TUI, subagents, background jobs as a block, timers, memory, skills, MCP, the smart default compaction, change declarations, approval and rating (they belong in idle-tasks), retrospectives, improvement, and replay of one turn. The record already holds what replay needs.

The tests run the loop against a scripted model. The evals in `idle-harness/evals/` run it against a real one.

## Next

One harness with an empty folder doing real tasks. Then replay of one turn.
