import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AnnotationInput, AnnotationState } from "./types.js";

function writeState(file: string, state: AnnotationState): void {
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
  writeFileSync(mdPath(file), renderMarkdown(state));
}

export function readState(file: string): AnnotationState {
  if (!existsSync(file)) {
    return {
      currentRound: 1,
      rounds: [
        {
          round: 1,
          startedAt: new Date().toISOString(),
          annotations: [],
        },
      ],
    };
  }
  return JSON.parse(readFileSync(file, "utf-8")) as AnnotationState;
}

export function appendAnnotation(
  file: string,
  input: AnnotationInput,
  now: string,
  id: string,
): AnnotationState {
  const state = readState(file);
  let round = state.rounds.find((r) => r.round === state.currentRound);
  if (!round) {
    round = {
      round: state.currentRound,
      startedAt: now,
      annotations: [],
    };
    state.rounds.push(round);
  }
  round.annotations.push({
    id,
    createdAt: now,
    story: input.story,
    variant: input.variant,
    note: input.note,
    target: input.target,
  });
  writeState(file, state);
  return state;
}

export function startRound(file: string, now: string): AnnotationState {
  const state = readState(file);
  state.currentRound += 1;
  state.rounds.push({
    round: state.currentRound,
    startedAt: now,
    annotations: [],
  });
  writeState(file, state);
  return state;
}

export function renderMarkdown(state: AnnotationState): string {
  return state.rounds
    .map((round) => {
      const header = `## Round ${round.round} — ${round.startedAt}`;
      if (round.annotations.length === 0) {
        return header;
      }
      const items = round.annotations
        .map(
          (a) =>
            `- **${a.target.component}** (${a.target.element}) — story ${a.story}/${a.variant}: ${a.note}`,
        )
        .join("\n");
      return `${header}\n${items}`;
    })
    .join("\n\n") + "\n";
}

export function mdPath(jsonFile: string): string {
  return join(dirname(jsonFile), "annotations.md");
}
