import type { AgentSession, AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { Usage } from "@mariozechner/pi-ai";
import type { GroveBroadcaster } from "../server/ws.js";
import type { Orchestrator } from "./machine.js";
import type { AgentMetrics } from "../lib/types.js";

/** Files that indicate which file the agent is currently working on. */
const FILE_TOOLS = new Set(["read", "edit", "write"]);

/** How often (ms) to broadcast a metrics snapshot when idle between tool calls. */
const METRICS_INTERVAL_MS = 5_000;

/**
 * Bridge Pi SDK agent events to Grove's orchestrator and WebSocket broadcaster.
 *
 * Subscribes to the session's event stream and:
 * - Translates `tool_execution_start` / `tool_execution_end` into
 *   `agent_event` GroveEvents broadcast to the dashboard.
 * - Tracks cumulative metrics (toolCalls, currentFile) and periodically
 *   broadcasts `metrics_update` events and sends `METRICS_UPDATE` to the
 *   orchestrator.
 * - Transitions the work stream to `needs_attention` when an unrecoverable
 *   error is detected.
 *
 * Returns an unsubscribe function that tears down all listeners and timers.
 */
export function bridgeAgentEvents(
  session: AgentSession,
  workStreamId: string,
  broadcaster: GroveBroadcaster,
  orchestrator: Orchestrator,
): () => void {
  const metrics: AgentMetrics = {
    workStreamId,
    toolCalls: 0,
    tokensUsed: 0,
    estimatedCost: 0,
    elapsedMs: 0,
    currentFile: null,
  };

  const startTime = Date.now();

  function broadcastMetrics() {
    metrics.elapsedMs = Date.now() - startTime;
    broadcaster.broadcast({
      type: "metrics_update",
      workStreamId,
      metrics: { ...metrics },
    });
    orchestrator.send(workStreamId, {
      type: "METRICS_UPDATE",
      metrics: { ...metrics },
    });
  }

  const metricsTimer = setInterval(broadcastMetrics, METRICS_INTERVAL_MS);

  /** Cache tool args by toolCallId so we can include them in end events. */
  const pendingToolArgs = new Map<string, string>();

  /** Extract the file path from tool args when possible. */
  function extractFile(toolName: string, args: unknown): string | null {
    if (!FILE_TOOLS.has(toolName) || typeof args !== "object" || args === null) {
      return null;
    }
    const record = args as Record<string, unknown>;
    if (typeof record.file_path === "string") return record.file_path;
    if (typeof record.path === "string") return record.path;
    return null;
  }

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    switch (event.type) {
      case "tool_execution_start": {
        const filePath = extractFile(event.toolName, event.args);
        if (filePath) metrics.currentFile = filePath;

        const inputStr = typeof event.args === "string"
          ? event.args
          : JSON.stringify(event.args);
        pendingToolArgs.set(event.toolCallId, inputStr);

        broadcaster.broadcast({
          type: "agent_event",
          workStreamId,
          event: {
            timestamp: Date.now(),
            toolName: event.toolName,
            input: inputStr,
            status: "started",
          },
        });
        break;
      }

      case "tool_execution_end": {
        metrics.toolCalls += 1;

        const cachedInput = pendingToolArgs.get(event.toolCallId) ?? "";
        pendingToolArgs.delete(event.toolCallId);

        const outputStr =
          typeof event.result === "string"
            ? event.result
            : JSON.stringify(event.result);

        broadcaster.broadcast({
          type: "agent_event",
          workStreamId,
          event: {
            timestamp: Date.now(),
            toolName: event.toolName,
            input: cachedInput,
            output: outputStr.slice(0, 500),
            status: event.isError ? "failed" : "completed",
          },
        });

        // Broadcast metrics after every tool call
        broadcastMetrics();
        break;
      }

      case "message_end": {
        const msg = event.message;
        if (
          msg &&
          typeof msg === "object" &&
          "role" in msg &&
          msg.role === "assistant" &&
          "usage" in msg
        ) {
          const usage = msg.usage as Usage;
          metrics.tokensUsed += usage.totalTokens;
          metrics.estimatedCost += usage.cost.total;
          broadcastMetrics();
        }
        break;
      }

      case "compaction_start": {
        broadcaster.broadcast({
          type: "agent_event",
          workStreamId,
          event: {
            timestamp: Date.now(),
            toolName: "__compaction",
            input: event.reason,
            status: "started",
          },
        });
        break;
      }

      case "compaction_end": {
        broadcaster.broadcast({
          type: "agent_event",
          workStreamId,
          event: {
            timestamp: Date.now(),
            toolName: "__compaction",
            input: event.reason,
            output: event.aborted ? "aborted" : "completed",
            status: event.aborted ? "failed" : "completed",
          },
        });
        break;
      }

      default:
        break;
    }
  });

  return () => {
    clearInterval(metricsTimer);
    unsubscribe();
    pendingToolArgs.clear();
  };
}
