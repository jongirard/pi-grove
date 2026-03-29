import { useState, useRef, useMemo } from "react";
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

/**
 * Derive plan state by processing the full events array on every render.
 * This avoids the race condition where `lastEvent` is overwritten before
 * a useEffect can process it, which caused plan_loaded events to be lost.
 */
export function usePlanState(
  events: GroveEvent[],
  _lastEvent: GroveEvent | null,
): PlanState {
  // Track the last processed index so we only process new events
  const processedRef = useRef(0);
  const stateRef = useRef<{
    plan: GrovePlan | null;
    workStreams: Record<string, WorkStreamWithMetrics>;
    timeSlots: TimeSlot[];
  }>({ plan: null, workStreams: {}, timeSlots: [] });

  // Process any new events since last render
  if (events.length > processedRef.current) {
    let { plan, workStreams, timeSlots } = stateRef.current;

    for (let i = processedRef.current; i < events.length; i++) {
      const event = events[i];

      switch (event.type) {
        case "plan_loaded": {
          plan = event.plan;
          timeSlots = event.plan.timeSlots;
          const wsMap: Record<string, WorkStreamWithMetrics> = {};
          for (const [id, ws] of Object.entries(event.plan.workStreams)) {
            const existingMetrics = workStreams[id]?.metrics;
            wsMap[id] = {
              ...ws,
              metrics: existingMetrics ?? emptyMetrics(id),
            };
          }
          workStreams = wsMap;
          break;
        }

        case "state_change": {
          const existing = workStreams[event.workStreamId];
          if (existing) {
            workStreams = {
              ...workStreams,
              [event.workStreamId]: {
                ...existing,
                status: event.status,
              },
            };
          }
          break;
        }

        case "metrics_update": {
          const existing = workStreams[event.workStreamId];
          if (existing) {
            workStreams = {
              ...workStreams,
              [event.workStreamId]: {
                ...existing,
                metrics: event.metrics,
              },
            };
          }
          break;
        }
      }
    }

    processedRef.current = events.length;
    stateRef.current = { plan, workStreams, timeSlots };
  }

  const { plan, workStreams, timeSlots } = stateRef.current;

  const aggregateMetrics = useMemo(
    () =>
      Object.values(workStreams).reduce(
        (acc, ws) => ({
          totalCost: acc.totalCost + ws.metrics.estimatedCost,
          totalTokens: acc.totalTokens + ws.metrics.tokensUsed,
          totalToolCalls: acc.totalToolCalls + ws.metrics.toolCalls,
        }),
        { totalCost: 0, totalTokens: 0, totalToolCalls: 0 },
      ),
    [workStreams],
  );

  return { plan, workStreams, timeSlots, aggregateMetrics };
}
