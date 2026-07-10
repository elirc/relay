import { z } from "zod";
import { defineConnector, defineAction } from "@relay/connector-sdk";

/**
 * CalendarLite connector — the S14 practical-exam connector, authored following the connector guide and
 * passed through the certification harness. It exercises every lesson: a header auth scheme, a semver, an
 * action with tight zod schemas, a **vendorKey** idempotency (CalendarLite honors `Idempotency-Key`), and
 * a trigger with a **dedupeKey** (events have a stable id). If the guide is good, a stranger could have
 * written exactly this — that's the test.
 */
export const calendarlite = defineConnector({
  key: "calendarlite",
  name: "CalendarLite",
  version: "1.0.0",
  auth: { type: "header", name: "authorization", format: (t) => `Bearer ${t}` },
  basePath: "/calendarlite",
  actions: [
    defineAction({
      key: "create-event",
      name: "Create Event",
      input: z.object({
        title: z.string(),
        start: z.string(), // ISO datetime
      }),
      output: z.object({ id: z.string() }),
      idempotency: { strategy: "vendorKey", header: "Idempotency-Key" },
      execute: async (ctx, input) => {
        const res = await ctx.http.request({
          method: "POST",
          path: "/events",
          body: input,
          headers: ctx.idempotencyKey ? { "Idempotency-Key": ctx.idempotencyKey } : undefined,
        });
        return { id: (res.body as { id: string }).id };
      },
    }),
  ],
  triggers: [
    {
      key: "event-created",
      name: "Event Created",
      type: "webhook",
      output: z.object({ id: z.string(), title: z.string(), start: z.string() }),
      dedupeKey: (item) => `calendarlite:${(item as { id: string }).id}`,
    },
  ],
});
