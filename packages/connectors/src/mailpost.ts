import { z } from "zod";
import { defineConnector, defineAction } from "@relay/connector-sdk";

/**
 * MailPost connector. Auth: Bearer. The `send-email` action declares **vendorKey** idempotency: MailPost
 * accepts an `Idempotency-Key` header and dedupes for us, so we just forward the engine's per-attempt
 * key. This is the *easy* case — the vendor carries the burden. Compare SheetLite, where WE do.
 */
export const mailpost = defineConnector({
  key: "mailpost",
  name: "MailPost",
  auth: { type: "header", name: "authorization", format: (t) => `Bearer ${t}` },
  basePath: "/mailpost",
  actions: [
    defineAction({
      key: "send-email",
      name: "Send Email",
      input: z.object({
        to: z.string().email(),
        subject: z.string(),
        body: z.string(),
      }),
      output: z.object({ id: z.string(), status: z.string() }),
      idempotency: { strategy: "vendorKey", header: "Idempotency-Key" },
      execute: async (ctx, input) => {
        const res = await ctx.http.request({
          method: "POST",
          path: "/v1/emails",
          body: input,
          // Forward the engine's idempotency key so a retried send is deduped by MailPost.
          headers: ctx.idempotencyKey ? { "Idempotency-Key": ctx.idempotencyKey } : undefined,
        });
        const b = res.body as { id: string; status: string };
        return { id: b.id, status: b.status };
      },
    }),
  ],
  triggers: [
    {
      key: "new-email",
      name: "New Email",
      type: "polling",
      output: z.object({ id: z.string(), to: z.string(), subject: z.string() }),
      dedupeKey: (item) => `mailpost:${(item as { id: string }).id}`, // MailPost has a stable message id
    },
  ],
});
