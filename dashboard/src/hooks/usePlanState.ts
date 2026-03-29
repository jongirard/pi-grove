import { useState, useEffect } from "react";
import type {
  GrovePlan,
  WorkStream,
  TimeSlot,
  AgentMetrics,
  GroveEvent,
} from "../lib/types.js";

interface WorkStreamWithMetrics extends WorkStream {
  metrics: AgentMetrics;
}

export interface PlanState {
  plan: GrovePlan | null;
  workStreams: Record<string, WorkStreamWithMetrics>;
  timeSlots: TimeSlot[];
  aggregateMetrics: {
    totalCost: number;
    totalTokens: number;
    totalToolCalls: number;
  };
}

const emptyMetrics = (workStreamId: string): AgentMetrics => ({
  workStreamId,
  toolCalls: 0,
  tokensUsed: 0,
  estimatedCost: 0,
  elapsedMs: 0,
  currentFile: null,
});

export function usePlanState(
  events: GroveEvent[],
  lastEvent: GroveEvent | null,
): PlanState {
  const [plan, setPlan] = useState<GrovePlan | null>(null);
  const [workStreams, setWorkStreams] = useState<
    Record<string, WorkStreamWithMetrics>
  >({});
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);

  // Process new events when lastEvent changes
  useEffect(() => {
    if (!lastEvent) return;

    switch (lastEvent.type) {
      case "plan_loaded": {
        const loadedPlan = lastEvent.plan;
        setPlan(loadedPlan);
        setTimeSlots(loadedPlan.timeSlots);

        const wsMap: Record<string, WorkStreamWithMetrics> = {};
        for (const [id, ws] of Object.entries(loadedPlan.workStreams)) {
          wsMap[id] = { ...ws, metrics: emptyMetrics(id) };
        }
        setWorkStreams(wsMap);
        break;
      }

      case "state_change": {
        setWorkStreams((prev) => {
          const existing = prev[lastEvent.workStreamId];
          if (!existing) return prev;
          return {
            ...prev,
            [lastEvent.workStreamId]: {
              ...existing,
              status: lastEvent.status,
            },
          };
        });
        break;
      }

      case "metrics_update": {
        setWorkStreams((prev) => {
          const existing = prev[lastEvent.workStreamId];
          if (!existing) return prev;
          return {
            ...prev,
            [lastEvent.workStreamId]: {
              ...existing,
              metrics: lastEvent.metrics,
            },
          };
        });
        break;
      }
    }
  }, [lastEvent]);

  const aggregateMetrics = Object.values(workStreams).reduce(
    (acc, ws) => ({
      totalCost: acc.totalCost + ws.metrics.estimatedCost,
      totalTokens: acc.totalTokens + ws.metrics.tokensUsed,
      totalToolCalls: acc.totalToolCalls + ws.metrics.toolCalls,
    }),
    { totalCost: 0, totalTokens: 0, totalToolCalls: 0 },
  );

  return { plan, workStreams, timeSlots, aggregateMetrics };
}
