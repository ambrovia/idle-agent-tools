# idle-harness

A tiny harness that closes its own loops and specialises itself. Research, not a product. [How it works](../docs/harness/how-it-works.md), in one page and a picture; the intent in [INTENT.md](INTENT.md); the design in [`docs/harness/base.md`](../docs/harness/base.md) and [`analytics.md`](../docs/harness/analytics.md).

The base owns the loop; a harness owns its turn and its tools. A harness is a folder under `~/.idle/harness/`. It starts empty and still works, because the base supplies the bare tools: read, write, edit, bash. The agent changes its own folder as it works. Every change is kept as a version, and the folder is loaded again at every turn.

## Run

Needs Node 22.18 or later, git, and an OpenRouter key. The key and the default model go in `~/.idle/config.json`, the file idle-tasks reads too:

```json
{ "openrouter": { "apiKey": "sk-or-…" }, "harness": { "model": "an OpenRouter model id" } }
```

`OPENROUTER_API_KEY` and `IDLE_HARNESS_MODEL` override them, and `"model"` in a harness's own `config.json` overrides the default model for that harness. Only the harness folders are versioned; `~/.idle/config.json` is not.

```bash
idle-harness/bin/idle-harness.mjs chat builder
```

`chat <harness> [message] [--session <id>] [--once]` talks to a harness, creating it on first use. `--once` answers and exits, with the answer on stdout and exit code 1 if the model call failed. When the input ends, the harness finishes what it was asked and the command exits. A session that is already running is talked to, not started again. `versions <harness>` lists the versions of its folder; `restore <harness> <version>` puts the folder back at one.

## What a harness writes

A tool, `~/.idle/harness/<harness>/tools/<name>.ts`:

```ts
export const description = 'what it does';
export const parameters = { type: 'object', properties: { … }, required: [ … ] };
export async function run(args, base) { return 'what it found'; }
```

Its own turn, `~/.idle/harness/<harness>/turn.ts`:

```ts
export async function turn(context, response, arrived, base) {
  const step = await base.turn(context, response, arrived); // the plain turn
  return step;                                              // { context, prompt }
}
```

`context` is what the model is shown: `{ model, system, tools, messages }`; an empty model means the default. `response` is the model's last message. `arrived` is what came in since. `base` is the building blocks: `tools`, `tool(call)`, `model(context, prompt)`, `turn(…)`, `versions`. Return the context and the messages to add for the next model call, or `prompt: null` to wait. If the turn throws, returns something that is not a whole step, or builds a request the provider refuses, the plain turn takes over and the agent is told.

## On disk

```
~/.idle/harness/<harness>/              the harness: config.json, turn.ts, tools/, whatever it needs — a git repository the base drives
~/.idle/harness/<harness>/.sessions/<session>/
    record.jsonl                        one entry per turn: what arrived, every call and its result, what the model saw (only the
                                        messages after the shared start), its answer, the turn's cost
    inbox/                              one file per item; the only way into a session
    lock                                the process running the session's loop
```

## Source

Each module imports only from the ones below it; a test fails on any import cycle.

| Module | What it is |
|---|---|
| `src/cli.ts` | the plain front end and the human's commands |
| `src/analytics.ts` | what each task took and what every version of the harness's own tools cost and did, read from the records (`idle-harness stats`) |
| `src/loop.ts` | the loop for one session, its building blocks, and stopping it mid-turn |
| `src/harness.ts` | a harness folder at one version: its turn, its tools, its settings |
| `src/tools.ts` | the bare tools and the registry |
| `src/turn.ts` | the turn contract, the plain turn, and the crude fit of a context past its limit |
| `src/record.ts` | a session's files: record, inbox, lock |
| `src/model.ts` | what the model is shown and answers, and the call through OpenRouter |
| `src/versions.ts` | versions of a harness folder, in git |
| `src/home.ts` | where everything lives |

Tests: `node --test tests/harness.test.mjs` from the repository root, against a scripted model and a stand-in for OpenRouter.
