import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { WorkStream, AgentMetrics } from "../lib/types.js";
import { CardHeader } from "./CardHeader.js";

interface AgentCardProps {
  workStream: WorkStream;
  metrics: AgentMetrics;
  children?: ReactNode;
  terminalSlot?: ReactNode;
}

export function AgentCard({
  workStream,
  metrics,
  children,
  terminalSlot,
}: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  return (
    <div className="rounded-lg bg-neutral-900/80 border border-neutral-800/70 overflow-hidden transition-colors hover:border-neutral-700/80">
      {/* Header — click to expand/collapse */}
      <div
        className="flex items-center cursor-pointer select-none group"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center pl-3 pr-1 py-2.5">
          <ChevronRight
            size={12}
            className={`text-neutral-600 transition-transform duration-150 group-hover:text-neutral-400 ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <CardHeader
            workStream={workStream}
            metrics={metrics}
            onToggleTerminal={
              terminalSlot
                ? () => setTerminalOpen((prev) => !prev)
                : undefined
            }
          />
        </div>
      </div>

      {/* Expanded children slot */}
      {expanded && children && (
        <div className="border-t border-neutral-800/50 bg-neutral-950/40 px-4 py-3">
          {children}
        </div>
      )}

      {/* Terminal slot */}
      {terminalOpen && terminalSlot && (
        <div className="border-t border-neutral-800/50">{terminalSlot}</div>
      )}
    </div>
  );
}
