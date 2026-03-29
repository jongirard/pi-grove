import type { WorkStream, AgentMetrics, TimeSlot, GroveEvent } from "../lib/types.js";
import { useAgentMetrics } from "../hooks/useAgentMetrics.js";
import { AgentCard } from "./AgentCard.js";

interface CardGridProps {
  workStreams: Record<string, WorkStream & { metrics: AgentMetrics }>;
  timeSlots: TimeSlot[];
  events: GroveEvent[];
}

function AgentCardWithMetrics({
  workStream,
  events,
}: {
  workStream: WorkStream & { metrics: AgentMetrics };
  events: GroveEvent[];
}) {
  const metrics = useAgentMetrics(workStream.id, events);
  // Prefer live metrics from events; fall back to props
  const resolvedMetrics = metrics.toolCalls > 0 || metrics.elapsedMs > 0
    ? metrics
    : workStream.metrics;

  return (
    <AgentCard workStream={workStream} metrics={resolvedMetrics} />
  );
}

export function CardGrid({ workStreams, timeSlots, events }: CardGridProps) {
  const ids = Object.keys(workStreams);

  if (ids.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-500 text-sm">
        No work streams active
      </div>
    );
  }

  // Group work streams by time slot for ordering
  const slotted = new Set<string>();
  const groups: { label: string; streamIds: string[] }[] = [];

  for (const slot of timeSlots) {
    const activeIds = slot.workStreamIds.filter((id) => id in workStreams);
    if (activeIds.length > 0) {
      groups.push({ label: `Slot ${slot.slot}`, streamIds: activeIds });
      activeIds.forEach((id) => slotted.add(id));
    }
  }

  // Anything not in a slot
  const unslotted = ids.filter((id) => !slotted.has(id));
  if (unslotted.length > 0) {
    groups.push({ label: "Other", streamIds: unslotted });
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 px-1">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.streamIds.map((id) => {
              const ws = workStreams[id];
              if (!ws) return null;
              return (
                <AgentCardWithMetrics
                  key={id}
                  workStream={ws}
                  events={events}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
