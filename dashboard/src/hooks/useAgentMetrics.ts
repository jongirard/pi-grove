import { useMemo } from "react";
import type { AgentMetrics, GroveEvent } from "../lib/types.js";

const EMPTY_METRICS: Omit<AgentMetrics, "workStreamId"> = {
  toolCalls: 0,
  tokensUsed: 0,
  estimatedCost: 0,
  elapsedMs: 0,
  currentFile: null,
};

export function useAgentMetrics(
  workStreamId: string,
  events: GroveEvent[],
): AgentMetrics {
  return useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (
        ev.type === "metrics_update" &&
        ev.workStreamId === workStreamId
      ) {
        return ev.metrics;
      }
    }
    return { workStreamId, ...EMPTY_METRICS };
  }, [workStreamId, events.length]);
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return String(tokens);
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}
