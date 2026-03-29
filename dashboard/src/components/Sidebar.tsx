import { ChevronRight, Layers } from "lucide-react";
import type { TimeSlot, WorkStream, AgentMetrics, WorkStreamStatus } from "../lib/types.js";

/** Solid dot colors for sidebar work stream indicators. */
const SIDEBAR_DOT_COLORS: Record<WorkStreamStatus, string> = {
  pending: "bg-neutral-600",
  ready: "bg-sky-400",
  running: "bg-amber-400",
  agent_complete: "bg-violet-400",
  verifying: "bg-cyan-400",
  done: "bg-emerald-400",
  needs_attention: "bg-red-400",
};

type WorkStreamWithMetrics = WorkStream & { metrics: AgentMetrics };

interface SidebarProps {
  plan: { name: string } | null;
  workStreams: Record<string, WorkStreamWithMetrics>;
  timeSlots: TimeSlot[];
  selectedPhase: number | null;
  onSelectPhase: (phase: number | null) => void;
}

type PhaseStatus = "pending" | "ready" | "active" | "done";

function derivePhaseStatus(
  streams: WorkStreamWithMetrics[],
): PhaseStatus {
  if (streams.length === 0) return "pending";
  if (streams.every((ws) => ws.status === "done")) return "done";
  if (
    streams.some(
      (ws) =>
        ws.status === "running" ||
        ws.status === "agent_complete" ||
        ws.status === "verifying" ||
        ws.status === "needs_attention",
    )
  )
    return "active";
  if (streams.some((ws) => ws.status === "ready")) return "ready";
  return "pending";
}

const PHASE_STATUS_STYLES: Record<
  PhaseStatus,
  { dot: string; label: string; text: string }
> = {
  pending: {
    dot: "bg-neutral-600",
    label: "Pending",
    text: "text-neutral-500",
  },
  ready: {
    dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]",
    label: "Ready",
    text: "text-emerald-400",
  },
  active: {
    dot: "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.4)]",
    label: "In progress",
    text: "text-amber-400",
  },
  done: {
    dot: "bg-emerald-400",
    label: "Complete",
    text: "text-emerald-400",
  },
};

export function Sidebar({
  plan,
  workStreams,
  timeSlots,
  selectedPhase,
  onSelectPhase,
}: SidebarProps) {
  if (!plan) {
    return (
      <aside className="flex w-56 flex-col border-r border-neutral-800/80 bg-neutral-950">
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          No plan loaded
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-56 flex-col border-r border-neutral-800/80 bg-neutral-950">
      {/* Overview link */}
      <div className="px-2 pt-3 pb-1">
        <button
          type="button"
          onClick={() => onSelectPhase(null)}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
            selectedPhase === null
              ? "bg-neutral-800/80 text-neutral-100"
              : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
          }`}
        >
          <Layers size={14} className="shrink-0 opacity-60" />
          <span className="text-xs font-medium">Overview</span>
        </button>
      </div>

      {/* Phase separator */}
      <div className="mx-3 my-1.5 border-t border-neutral-800/60" />

      <div className="px-2 pb-1">
        <span className="px-2.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
          Phases
        </span>
      </div>

      {/* Phase navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-0.5">
          {timeSlots.map((slot) => {
            const streams = slot.workStreamIds
              .map((id) => workStreams[id])
              .filter(Boolean);
            const phaseStatus = derivePhaseStatus(streams);
            const style = PHASE_STATUS_STYLES[phaseStatus];
            const isSelected = selectedPhase === slot.slot;
            const doneCount = streams.filter(
              (ws) => ws.status === "done",
            ).length;

            return (
              <div key={slot.slot}>
                <button
                  type="button"
                  onClick={() => onSelectPhase(slot.slot)}
                  className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-neutral-800/80 text-neutral-100"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                  }`}
                >
                  {/* Phase status dot */}
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
                  />

                  <span className="flex-1 text-xs font-medium min-w-0 truncate">
                    Phase {slot.slot}
                  </span>

                  <span
                    className={`text-[10px] shrink-0 ${
                      isSelected ? style.text : "text-neutral-600"
                    }`}
                  >
                    {doneCount}/{streams.length}
                  </span>

                  <ChevronRight
                    size={12}
                    className={`shrink-0 transition-opacity ${
                      isSelected
                        ? "opacity-40"
                        : "opacity-0 group-hover:opacity-20"
                    }`}
                  />
                </button>

                {/* Work stream previews — below the button, only when selected */}
                {isSelected && streams.length > 0 && (
                  <div className="flex flex-col gap-px px-2.5 pt-1 pb-2">
                    {streams.map((ws) => (
                      <div
                        key={ws.id}
                        className="flex items-center gap-2.5 rounded px-2.5 py-1"
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${SIDEBAR_DOT_COLORS[ws.status]}`}
                        />
                        <span className="truncate text-[11px] text-neutral-500">
                          {ws.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
