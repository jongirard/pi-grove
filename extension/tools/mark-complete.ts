import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

/**
 * Creates a custom tool that an agent calls when it has finished all tasks
 * for its work stream. The `onComplete` callback fires to notify the
 * orchestrator so the work stream can transition to `agent_complete`.
 */
export function createMarkCompleteTool(
  workStreamId: string,
  onComplete: (summary: string) => void,
): ToolDefinition {
  return {
    name: "mark_complete",
    label: "Mark Complete",
    description:
      "Call this tool when you have completed ALL tasks for this work stream. " +
      "Provide a brief summary of what was accomplished.",
    parameters: Type.Object({
      summary: Type.String({
        description: "Brief summary of what was done",
      }),
    }),
    execute: async (_toolCallId, params) => {
      const { summary } = params as { summary: string };
      onComplete(summary);
      return {
        content: [
          {
            type: "text" as const,
            text: `Work stream ${workStreamId} marked as complete.`,
          },
        ],
        details: {},
      };
    },
  };
}
