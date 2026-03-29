import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TimeSlot, WorkStream, AgentMetrics } from "../lib/types.js";
import { STATUS_ICONS, STATUS_COLORS } from "../lib/constants.js";

type WorkStreamWithMetrics = WorkStream & { metrics: AgentMetrics };

interface SidebarProps {
  plan: { name: string } | null;
  workStreams: Record<string, WorkStreamWithMetrics>;
  timeSlots: TimeSlot[];
  onSelectWorkStream: (id: string) => void;
  selectedWorkStream: string | null;
}

export function Sidebar({
  plan,
  workStreams,
  timeSlots,
  onSelectWorkStream,
  selectedWorkStream,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const toggleSlot = (slot: number) => {
    setCollapsed((prev) => ({ ...prev, [slot]: !prev[slot] }));
  };

  if (!plan) {
    return (
      <aside className="flex w-70 flex-col border-r border-neutral-800 bg-neutral-950">
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          No plan loaded
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-70 flex-col overflow-y-auto border-r border-neutral-800 bg-neutral-950">
      <div className="px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Work Streams
        </h2>
      </div>

      {timeSlots.map((slot) => {
        const isCollapsed = collapsed[slot.slot] ?? false;
        const slotStreams = slot.workStreamIds
          .map((id) => workStreams[id])
          .filter(Boolean);
        const doneCount = slotStreams.filter(
          (ws) => ws.status === "done",
        ).length;

        return (
          <div key={slot.slot}>
            <button
              type="button"
              onClick={() => toggleSlot(slot.slot)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-900"
            >
              <ChevronDown
                size={14}
                className={`text-neutral-500 transition-transform duration-200 ${
                  isCollapsed ? "-rotate-90" : ""
                }`}
              />
              <span className="text-xs font-medium text-neutral-300">
                Phase {slot.slot}
              </span>
              <span className="ml-auto rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                {doneCount}/{slotStreams.length}
              </span>
            </button>

            <div
              className={`overflow-hidden transition-all duration-200 ${
                isCollapsed ? "max-h-0" : "max-h-[2000px]"
              }`}
            >
              {slotStreams.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => onSelectWorkStream(ws.id)}
                  className={`flex w-full items-center gap-2 px-4 py-1.5 text-left transition-colors hover:bg-neutral-900 ${
                    selectedWorkStream === ws.id
                      ? "bg-neutral-900/80"
                      : ""
                  }`}
                >
                  <span
                    className={`text-sm ${STATUS_COLORS[ws.status]}`}
                  >
                    {STATUS_ICONS[ws.status]}
                  </span>
                  <span className="truncate text-xs text-neutral-300">
                    <span className="font-medium text-neutral-100">
                      {ws.id}:
                    </span>{" "}
                    {ws.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
