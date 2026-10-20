// The turn: what a harness programs, and the base's plain turn, which is all an empty harness is.

import type { Context, Message, ToolCall, ToolSpec } from './model.ts';
import type { Item } from './record.ts';

// What a turn returns: the context, and the messages to add for the next model call. No prompt means wait.
export type Step = { context: Context; prompt: Message[] | null };

// The building blocks the base hands to a turn.
export type Blocks = {
  name: string; // the harness's name
  harness: string; // its folder
  version: string; // the version of the folder this turn runs
  cwd: string; // where the work is
  session: string;
  tools: ToolSpec[]; // every tool there is: the base's, and the harness's own
  tool(call: ToolCall): Promise<string>;
  model(context: Context, prompt: Message[]): Promise<Message>;
  turn(context: Context, response: Message | null, arrived: Item[]): Promise<Step>; // the plain turn
  versions: { list(): string; show(version: string): string; restore(version: string): string };
};

export type Turn = (context: Context, response: Message | null, arrived: Item[], base: Blocks) => Promise<Step> | Step;

const system = (harness: string, cwd: string) => `You are working in ${cwd}.

You run inside a harness that is yours: the folder ${harness}. It starts empty. Change anything in it that makes your work better, faster or cheaper. The folder is loaded again at every turn, and every change is kept as a version: the versions tool lists them, shows one, and puts the folder back at one.

To give yourself a tool, write ${harness}/tools/<name>.ts:

  export const description = 'what it does'
  export const parameters = { type: 'object', properties: { … }, required: [ … ] }
  export async function run(args, base) { return 'what it found' }

To change how a turn runs, write ${harness}/turn.ts:

  export async function turn(context, response, arrived, base) {
    const step = await base.turn(context, response, arrived)   // the plain turn
    return step                                                // { context, prompt }
  }

context is what the model is shown: { model, system, tools, messages }. response is the model's last message. arrived is what came in since: [{ from, at, text }]. Return the context and the messages to add for the next model call, or prompt: null to wait. base.tools lists every tool, base.tool(call) runs one, base.model(context, prompt) is an extra model call, base.versions lists, shows and restores. If your turn or a tool of yours breaks, the base carries on without it and tells you.`;

export const fresh = (harness: string, cwd: string): Context => ({ model: '', system: system(harness, cwd), tools: [], messages: [] });

// Run the tool calls, pass on what arrived, offer every tool there is, and wait when there is nothing to send.
export async function turn(context: Context, response: Message | null, arrived: Item[], base: Blocks): Promise<Step> {
  const messages = [...context.messages];
  const prompt: Message[] = [];
  if (response) {
    messages.push(response);
    for (const call of response.tool_calls ?? []) prompt.push({ role: 'tool', tool_call_id: call.id, content: await base.tool(call) });
  }
  for (const item of arrived) prompt.push({ role: 'user', content: item.from === 'user' ? item.text : `[${item.from}] ${item.text}` });
  return { context: { ...context, tools: base.tools, messages }, prompt: prompt.length ? prompt : null };
}

// The base's crude fallback for a context that would pass its limit; a harness's own turn can do far better, and the
// turn owns the context. The oldest tool results are shortened to a pointer, oldest first, until the request is
// under 70% of the limit. The system prompt, the first message and the newest messages stay as they are, and nothing
// is removed, so every tool call keeps its result. Tokens are guessed at four characters each.
export function fit(context: Context, prompt: Message[], limit: number, record: string): { context: Context; trimmed: number } {
  const size = (messages: Message[]) => Math.ceil(JSON.stringify({ system: context.system, tools: context.tools, messages: [...messages, ...prompt] }).length / 4);
  if (size(context.messages) <= limit) return { context, trimmed: 0 };
  const messages = [...context.messages];
  let trimmed = 0;
  for (let i = 1; i < messages.length - 6 && size(messages) > limit * 0.7; i++) {
    const text = String(messages[i].content ?? '');
    if (messages[i].role !== 'tool' || text.length < 200 || text.startsWith('[shortened')) continue;
    messages[i] = { ...messages[i], content: `[shortened by the base to fit the context: ${text.length} characters, kept in ${record}]\n${text.slice(0, 120)}` };
    trimmed++;
  }
  return { context: { ...context, messages }, trimmed };
}

// A step the loop can trust. Anything else counts as a turn that threw.
export function check(step: any): Step {
  const messages = (list: unknown) => Array.isArray(list) && list.every((message) => typeof message?.role === 'string');
  const context = step?.context;
  if (typeof context?.model !== 'string' || typeof context.system !== 'string' || !Array.isArray(context.tools) || !messages(context.messages)) {
    throw new Error('the turn returned no whole context: it needs model, system, tools and messages');
  }
  if (step.prompt != null && !messages(step.prompt)) throw new Error('the prompt must be null or a list of messages');
  return { context, prompt: step.prompt ?? null };
}
