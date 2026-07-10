import { createHash } from "node:crypto";
import { z } from "zod";
import { defineConnector, defineAction } from "@relay/connector-sdk";

/**
 * ChatBox connector (S06 — closes the S03 deferral). Third connector, ~90 lines: the SDK curve bends.
 * Auth: `Authorization: Token`. The `post-message` action uses **dedupeWindow** idempotency — ChatBox
 * has no idempotency header AND messages have no natural key we control before sending, so the best we
 * can do is suppress duplicates within a short window. The weakest strategy, chosen honestly because
 * the vendor gives us nothing stronger.
 */
export const chatbox = defineConnector({
  key: "chatbox",
  name: "ChatBox",
  version: "1.0.0",
  auth: { type: "header", name: "authorization", format: (t) => `Token ${t}` },
  basePath: "/chatbox",
  actions: [
    defineAction({
      key: "post-message",
      name: "Post Message",
      input: z.object({ channel: z.string(), text: z.string() }),
      output: z.object({ ts: z.string(), channel: z.string() }),
      idempotency: { strategy: "dedupeWindow", windowMs: 60_000 },
      execute: async (ctx, input) => {
        const res = await ctx.http.request({ method: "POST", path: "/api/messages", body: input });
        const b = res.body as { ok: boolean; ts?: string; channel?: string; error?: string };
        // ChatBox returns ok:false at HTTP 200 — the connector normalizes that into a real failure.
        if (!b.ok) throw new Error(`chatbox error: ${b.error ?? "unknown"}`);
        return { ts: b.ts ?? "", channel: b.channel ?? input.channel };
      },
    }),
  ],
  triggers: [
    {
      key: "message-posted",
      name: "Message Posted",
      type: "webhook",
      output: z.object({ ts: z.string(), channel: z.string(), text: z.string() }),
      // ChatBox messages have a `ts`; fall back to a content hash if a payload somehow lacks one.
      dedupeKey: (item) => {
        const m = item as { ts?: string; channel?: string; text?: string };
        return m.ts
          ? `chatbox:${m.ts}`
          : `chatbox:${createHash("sha1").update(`${m.channel}:${m.text}`).digest("hex").slice(0, 16)}`;
      },
    },
  ],
});
