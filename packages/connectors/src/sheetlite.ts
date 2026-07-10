import { createHash } from "node:crypto";
import { z } from "zod";
import { defineConnector, defineAction } from "@relay/connector-sdk";

/**
 * SheetLite connector. Auth: `X-SheetLite-Key`. The `add-row` action declares **naturalKey**
 * idempotency because SheetLite has NO idempotency support of its own. So WE derive a stable key from
 * the input (sheet id + a hash of the row values); the engine (S07) uses it to dedupe *before* calling.
 * The burden is on us, and that's the whole lesson: read this `idempotency` block next to MailPost's.
 */
const addRowInput = z.object({
  sheetId: z.string(),
  values: z.record(z.unknown()),
});

export const sheetlite = defineConnector({
  key: "sheetlite",
  name: "SheetLite",
  version: "1.0.0",
  auth: { type: "header", name: "x-sheetlite-key", format: (t) => t },
  basePath: "/sheetlite",
  actions: [
    defineAction({
      key: "add-row",
      name: "Add Row",
      input: addRowInput,
      output: z.object({ id: z.string() }),
      idempotency: {
        strategy: "naturalKey",
        key: (input) => {
          const { sheetId, values } = addRowInput.parse(input);
          const hash = createHash("sha1").update(JSON.stringify(values)).digest("hex").slice(0, 16);
          return `${sheetId}:${hash}`;
        },
      },
      execute: async (ctx, input) => {
        const { values } = input;
        const res = await ctx.http.request({
          method: "POST",
          path: "/rows",
          body: { values },
          // The engine derives a NATURAL key (content hash) and passes it here; SheetLite has no native
          // idempotency, but the farm honors this header so a retried/resumed add-row can't duplicate.
          headers: ctx.idempotencyKey ? { "Idempotency-Key": ctx.idempotencyKey } : undefined,
        });
        const b = res.body as { row: { id: string } };
        return { id: b.row.id };
      },
    }),
  ],
  triggers: [
    {
      key: "row-created",
      name: "Row Created",
      type: "webhook",
      output: z.object({ id: z.string(), values: z.record(z.unknown()) }),
      dedupeKey: (item) => `sheetlite:${(item as { id: string }).id}`, // rows have ids
    },
  ],
});
