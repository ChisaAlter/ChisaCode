import { z } from "zod";

/**
 * App → Server: User interaction callback for generative UI components.
 */
export const GenerativeUiActionRequestSchema = z.object({
  type: z.literal("generative_ui.action"),
  requestId: z.string(),
  /** Target agent session */
  agentId: z.string(),
  /** Match against generative_ui timeline item instanceId */
  instanceId: z.string(),
  /** Action name as defined in the component's actions array */
  action: z.string(),
  /** Action-specific payload */
  payload: z.unknown(),
  /** Event timestamp (client-side) */
  timestamp: z.number(),
});

/**
 * Server → App: Acknowledgement of received interaction.
 */
export const GenerativeUiActionResponseSchema = z.object({
  type: z.literal("generative_ui.action.response"),
  payload: z.object({
    requestId: z.string(),
    received: z.boolean(),
    error: z.string().nullable(),
  }),
});
