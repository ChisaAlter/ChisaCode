/**
 * GenerativeUiHandler — handles generative UI action messages from the client.
 *
 * Receives user interactions with generative UI components, formats them as
 * system-injected context, and dispatches the context to the target agent.
 */

import type { DisposableHandler, GenerativeUiHandlerContext } from "./session-context.js";
import { GenerativeUiActionResponseSchema } from "@chisacode/protocol/generative-ui/rpc-schemas";
import { type SessionInboundMessage } from "@chisacode/protocol/messages";

export class GenerativeUiHandler implements DisposableHandler {
  private readonly context: GenerativeUiHandlerContext;

  constructor(context: GenerativeUiHandlerContext) {
    this.context = context;
  }

  dispose(): void {
    // Reserved for future cleanup (subscriptions, timers, etc.)
  }

  async dispatch(msg: SessionInboundMessage): Promise<undefined> {
    switch (msg.type) {
      case "generative_ui.action.request":
      // COMPAT(generativeUiActionFlatRpc): added in v0.1.101; remove after 2027-01-11 once the client floor is >= v0.1.101.
      case "generative_ui.action":
        await this.handleUiAction(msg);
        return undefined;
      default:
        return undefined;
    }
  }

  private async handleUiAction(
    msg: Extract<
      SessionInboundMessage,
      { type: "generative_ui.action" | "generative_ui.action.request" }
    >,
  ): Promise<void> {
    const { requestId, agentId, instanceId, action, payload, timestamp } = msg;

    // Validate agent exists and is in a runnable state
    const agent = this.context.getAgent(agentId);
    if (!agent) {
      this.context.emit(
        GenerativeUiActionResponseSchema.parse({
          type: "generative_ui.action.response",
          payload: {
            requestId,
            received: false,
            error: `agent not found: ${agentId}`,
          },
        }),
      );
      return;
    }

    const status = agent.status;
    if (status !== "running" && status !== "idle") {
      this.context.emit(
        GenerativeUiActionResponseSchema.parse({
          type: "generative_ui.action.response",
          payload: {
            requestId,
            received: false,
            error: `agent not found: ${agentId}`,
          },
        }),
      );
      return;
    }

    // Format system notification text for agent context injection
    const contextText = [
      "<chisacode-system>",
      "User interacted with generative UI component.",
      `Instance: ${instanceId}`,
      `Action: ${action}`,
      `Payload: ${JSON.stringify(payload)}`,
      `Time: ${new Date(timestamp).toISOString()}`,
      "</chisacode-system>",
    ].join("\n");

    try {
      await this.context.sendPromptToAgent(agentId, contextText, {
        unarchive: false,
        systemNotification: true,
      });

      this.context.emit(
        GenerativeUiActionResponseSchema.parse({
          type: "generative_ui.action.response",
          payload: {
            requestId,
            received: true,
            error: null,
          },
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.context.emit(
        GenerativeUiActionResponseSchema.parse({
          type: "generative_ui.action.response",
          payload: {
            requestId,
            received: false,
            error: `context injection failed: ${message}`,
          },
        }),
      );
    }
  }
}
