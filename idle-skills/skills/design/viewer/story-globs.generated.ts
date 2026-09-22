import type { GlobSource } from "./discovery.js";

export const storyGlobs = {
  ...import.meta.glob<Record<string, unknown>>("../src/**/*.stories.tsx", {
    eager: true,
  }),
} as GlobSource;
