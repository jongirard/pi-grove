import { useMemo, useCallback } from "react";
import type { WorkStream, AgentMetrics, TimeSlot, GroveEvent, AgentToolEvent, GroveCommand } from "../lib/types.js";
import { useAgentMetrics } from "../hooks/useAgentMetrics.js";
import { AgentCard } from "./AgentCard.js";
import { StepTimeline } from "./StepTimeline.js";
import { TerminalView } from "./TerminalView.js";
import { SteeringInput } from "./SteeringInput.js";
import { PlantPrompt } from "./PlantPrompt.js";
import { PhaseConnector } from "./PhaseConnector.js";
import { PendingPhaseNotice } from "./PendingPhaseNotice.js";

interface CardGridProps {
  workStreams: Record<string, WorkStream & { metrics: AgentMetrics }>;
  timeSlots: TimeSlot[];
  events: GroveEvent[];
  sendCommand: (cmd: GroveCommand) => void;
  selectedPhase: number | null;
  onSelectPhase: (phase: number | null) => void;
}

/** Extract agent_event entries for a specific work stream. */
function useWorkStreamToolEvents(
  workStreamId: string,
  events: GroveEvent[],
): AgentToolEvent[] {
  return useMemo(
    () =>
      events
        .filter(
          (e): e is Extract<GroveEvent, { type: "agent_event" }> =>
            e.type === "agent_event" && e.workStreamId === workStreamId,
        )
        .map((e) => e.event),
    [workStreamId, events.length],
  );
}

/** Derive the set of slots that have received a slot_ready event. */
function useReadySlots(events: GroveEvent[]): Set<number> {
  return useMemo(() => {
    const ready = new Set<number>();
    for (const e of events) {
      if (e.type === "slot_ready") ready.add(e.slot);
    }
    return ready;
  }, [events.length]);
}

function AgentCardWithDetails({
  workStream,
  events,
  sendCommand,
}: {
  workStream: WorkStream & { metrics: AgentMetrics };
  events: GroveEvent[];
  sendCommand: (cmd: GroveCommand) => void;
}) {
  const metrics = useAgentMetrics(workStream.id, events);
  const resolvedMetrics =
    metrics.toolCalls > 0 || metrics.elapsedMs > 0 ? metrics : workStream.metrics;
  const toolEvents = useWorkStreamToolEvents(workStream.id, events);

  const handleSteer = useCallback(
    (message: string) => {
      const isRerun =
        workStream.status === "done" || workStream.status === "needs_attention";
      sendCommand(
        isRerun
          ? { type: "rerun_agent", workStreamId: workStream.id, message }
          : { type: "steer_agent", workStreamId: workStream.id, message },
      );
    },
    [workStream.id, workStream.status, sendCommand],
  );

  return (
    <AgentCard
      workStream={workStream}
      metrics={resolvedMetrics}
      terminalSlot={<TerminalView events={toolEvents} isOpen={true} />}
    >
      <div className="space-y-3">
        <StepTimeline
          filesToCreate={workStream.filesToCreate}
          doneWhen={workStream.doneWhen}
          events={toolEvents}
        />
        <SteeringInput
          workStreamId={workStream.id}
          status={workStream.status}
          onSend={handleSteer}
        />
      </div>
    </AgentCard>
  );
}

export function CardGrid({ workStreams, timeSlots, events, sendCommand, selectedPhase, onSelectPhase }: CardGridProps) {
  const ids = Object.keys(workStreams);
  const readySlots = useReadySlots(events);

  const handlePlant = useCallback(
    (slot: number) => {
      sendCommand({ type: "plant_slot", slot });
    },
    [sendCommand],
  );

  if (ids.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-500 text-sm">
        No work streams active
      </div>
    );
  }

  // Group work streams by time slot
  const slotted = new Set<string>();
  const groups: { slot: TimeSlot; streamIds: string[] }[] = [];

  for (const slot of timeSlots) {
    const activeIds = slot.workStreamIds.filter((id) => id in workStreams);
    if (activeIds.length > 0) {
      groups.push({ slot, streamIds: activeIds });
      activeIds.forEach((id) => slotted.add(id));
    }
  }

  const unslotted = ids.filter((id) => !slotted.has(id));

  // Filter to selected phase
  const visibleGroups =
    selectedPhase !== null
      ? groups.filter((g) => g.slot.slot === selectedPhase)
      : groups;

  // Overview: show all phases
  const isOverview = selectedPhase === null;

  return (
    <div className="space-y-5">
      {visibleGroups.map((group) => {
        const slotNum = group.slot.slot;
        const isReady = readySlots.has(slotNum);
        const allPendingOrReady = group.streamIds.every((id) => {
          const s = workStreams[id]?.status;
          return s === "pending" || s === "ready";
        });
        const showPlantPrompt = isReady && allPendingOrReady;
        const showPendingNotice = !isReady && allPendingOrReady;

        // Find the previous/next phase (if any)
        const currentGroupIdx = groups.findIndex((g) => g.slot.slot === slotNum);
        const prevGroup = groups[currentGroupIdx - 1];
        const nextGroup = groups[currentGroupIdx + 1];

        // Current phase is "complete" when all its streams are done
        const allDone = group.streamIds.every(
          (id) => workStreams[id]?.status === "done",
        );

        return (
          <section key={slotNum}>
            {/* Only show phase header in overview mode */}
            {isOverview && (
              <h2 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-3 px-0.5">
                Phase {slotNum}
              </h2>
            )}

            {showPlantPrompt && (
              <div className="mb-3">
                <PlantPrompt
                  slot={slotNum}
                  workStreamIds={group.slot.workStreamIds}
                  workStreams={workStreams}
                  onPlant={handlePlant}
                />
              </div>
            )}

            {showPendingNotice && prevGroup && (
              <div className="mb-3">
                <PendingPhaseNotice previousPhase={prevGroup.slot.slot} />
              </div>
            )}

            <div className="flex flex-col gap-2">
              {group.streamIds.map((id) => {
                const ws = workStreams[id];
                if (!ws) return null;
                return (
                  <AgentCardWithDetails
                    key={id}
                    workStream={ws}
                    events={events}
                    sendCommand={sendCommand}
                  />
                );
              })}
            </div>

            {/* Phase connector to next phase */}
            {!isOverview && nextGroup && (
              <PhaseConnector
                nextPhase={nextGroup.slot.slot}
                isReady={allDone}
                onNavigate={onSelectPhase}
              />
            )}
          </section>
        );
      })}

      {/* Unslotted streams only in overview */}
      {isOverview && unslotted.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-3 px-0.5">
            Other
          </h2>
          <div className="flex flex-col gap-2">
            {unslotted.map((id) => {
              const ws = workStreams[id];
              if (!ws) return null;
              return (
                <AgentCardWithDetails
                  key={id}
                  workStream={ws}
                  events={events}
                  sendCommand={sendCommand}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state when a phase is selected but has no streams */}
      {selectedPhase !== null && visibleGroups.length === 0 && (
        <div className="flex items-center justify-center py-16 text-neutral-500 text-sm">
          No work streams in this phase
        </div>
      )}
    </div>
  );
}
