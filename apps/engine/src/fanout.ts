import { mapWithConcurrency } from "@relay/shared";

/**
 * Fan-out (S10): run a sub-path once per array item, with bounded concurrency and PER-ITEM checkpoints.
 *
 * This is the S07 durability dividend at scale, and it's nearly free: each iteration is just a
 * checkpointed node, so a fan-out of 500 that crashes at item 300 RESUMES at 301 — completed items
 * rehydrate their output and never re-fire. Imagine this without S07: you can't resume, so you re-send
 * 300 emails. Good foundations turn a scary feature into a small one.
 */
export interface FanoutDeps {
  runItem: (item: unknown, index: number) => Promise<unknown>;
  /** per-item checkpoint check (S07) */
  isItemDone?: (index: number) => boolean;
  loadItemOutput?: (index: number) => unknown;
}

export async function executeFanout(
  items: unknown[],
  concurrency: number,
  deps: FanoutDeps,
): Promise<unknown[]> {
  return mapWithConcurrency(items, concurrency, async (item, i) => {
    if (deps.isItemDone?.(i)) return deps.loadItemOutput?.(i); // already committed — don't re-fire
    return deps.runItem(item, i);
  });
}
