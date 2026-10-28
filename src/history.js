import { z } from "zod";

const time = z.union([z.number(), z.string().datetime({ offset: true }).transform((v) => Date.parse(v))]);

export function registerHistory(register, bridge) {
  register("history_search", {
    description: "Read-only history search. Times accept ISO 8601 or epoch milliseconds; startTime defaults to 24 hours ago.",
    inputSchema: {
      text: z.string().default(""),
      startTime: time.default(() => Date.now() - 86400000),
      endTime: time.optional(),
      maxResults: z.number().int().min(1).max(1000).default(100),
    },
    annotations: { readOnlyHint: true },
  }, (args) => bridge.call("history.search", args));
}
