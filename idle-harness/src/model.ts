// What the model is shown, what it answers, and the one call that goes out. OpenRouter speaks the chat format
// for every provider and reports what each call cost, in dollars.

import { request as http } from 'node:http';
import { request as https } from 'node:https';
import { user } from './home.ts';

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type Message = { role: 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; [more: string]: unknown };
export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: object } };

// What the model is shown. A turn hands it back every time, so all of it is the harness's to shape.
// An empty model means the harness's default.
export type Context = { model: string; system: string; tools: ToolSpec[]; messages: Message[] };

export type Reply = { message: Message; usage: Record<string, unknown>; cost: number | null };
export type Model = (context: Context, prompt: Message[]) => Promise<Reply>;

// A request the provider turned down. Sending it again would only be turned down again.
export const refused = (error: any) => error?.status >= 400 && error.status < 500 && error.status !== 429;

// A request turned down for being longer than the model can read. A shorter one may go through.
export const tooLong = (error: any) => refused(error) && /context|too long|too many tokens|maximum/i.test(String(error?.message));

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

// No time limit: Node's fetch gives up on an answer that takes five minutes to start, and a long reasoning call can.
function post(url: string, key: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((done, fail) => {
    const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) };
    const request = (url.startsWith('https:') ? https : http)(url, { method: 'POST', headers }, (answer) => {
      let text = '';
      answer.setEncoding('utf8');
      answer.on('data', (chunk) => { text += chunk; });
      answer.on('end', () => done({ status: answer.statusCode ?? 0, text }));
      answer.on('error', fail);
    });
    request.on('error', fail);
    request.end(body);
  });
}

export async function model(context: Context, prompt: Message[]): Promise<Reply> {
  const key = process.env.OPENROUTER_API_KEY || user().openrouter?.apiKey;
  if (!key) throw new Error('no OpenRouter key: set "openrouter": { "apiKey" } in ~/.idle/config.json, or OPENROUTER_API_KEY');
  if (!context.model) throw new Error('no model: set "harness": { "model" } in ~/.idle/config.json, "model" in the harness\'s config.json, or IDLE_HARNESS_MODEL');
  const body = JSON.stringify({
    model: context.model,
    messages: [{ role: 'system', content: context.system }, ...context.messages, ...prompt],
    ...(context.tools.length ? { tools: context.tools } : {}),
  });
  // A busy or failing provider is tried again; a refused request is not.
  for (let attempt = 1; ; attempt++) {
    let status = 0;
    let answer: any;
    try {
      const reply = await post(`${process.env.IDLE_HARNESS_API || 'https://openrouter.ai/api/v1'}/chat/completions`, key, body);
      status = reply.status;
      answer = JSON.parse(reply.text);
    } catch (error) {
      answer = { error: { message: String(error) } };
    }
    const message = answer?.choices?.[0]?.message;
    if (message) {
      // Kept as the provider gave it: a reasoning model wants its own fields back on the next call.
      const { tool_calls: calls, ...rest } = message;
      return { message: { ...rest, role: 'assistant', content: message.content ?? null, ...(calls?.length ? { tool_calls: calls } : {}) }, usage: answer.usage ?? {}, cost: answer.usage?.cost ?? null };
    }
    // An answer of 200 without a message is a provider behind OpenRouter failing, its timeout for one.
    const again = status === 0 || status === 200 || status === 429 || status >= 500;
    if (!again || attempt === 3) {
      throw Object.assign(new Error(`the model call failed (${status || 'no answer'}): ${answer?.error?.message ?? JSON.stringify(answer)}`), { status });
    }
    await pause(attempt * 2000);
  }
}
