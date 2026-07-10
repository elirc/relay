import { z } from "zod";

/**
 * The relay definition (S04): a trigger plus an ordered list of action steps. This is the JSON stored
 * immutably per RelayVersion. Linear for now; branching/DAG arrives in S08 (the shape stays a graph so
 * the migration is additive). A step's `config` values may be literals OR `{{path}}` templates resolved
 * at run time by @relay/expr.
 */
export const RelayTriggerSchema = z.object({
  connector: z.string(),
  trigger: z.string(),
});

export const RelayStepSchema = z.object({
  id: z.string(),
  connector: z.string(),
  action: z.string(),
  config: z.record(z.unknown()),
});

export const RelayDefinitionSchema = z.object({
  trigger: RelayTriggerSchema,
  steps: z.array(RelayStepSchema),
});

export type RelayTrigger = z.infer<typeof RelayTriggerSchema>;
export type RelayStep = z.infer<typeof RelayStepSchema>;
export type RelayDefinition = z.infer<typeof RelayDefinitionSchema>;
