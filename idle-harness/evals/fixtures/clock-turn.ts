// Know the date and time at every turn: put it at the top of the system prompt.
export async function turn(context, response, arrived, base) {
  const step = await base.turn(context, response, arrived);
  const system = step.context.system.replace(/^Current time: .*\n\n/, '');
  return { ...step, context: { ...step.context, system: `Current time: ${new Date().toISOString()}\n\n${system}` } };
}
