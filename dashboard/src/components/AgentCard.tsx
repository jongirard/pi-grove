import { useState, type ReactNode } from "react";
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
    <div
      className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-neutral-700 transition"
    >
      {/* Header — click to expand/collapse */}
      <div
        className="cursor-pointer select-none"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <CardHeader
          workStream={workStream}
          metrics={metrics}
          onToggleTerminal={terminalSlot ? () => setTerminalOpen((prev) => !prev) : undefined}
        />
      </div>

      {/* Expanded children slot */}
      {expanded && children && (
        <>
          <div className="border-t border-neutral-800" />
          <div className="px-3 py-2">{children}</div>
        </>
      )}

      {/* Terminal slot */}
      {terminalOpen && terminalSlot && (
        <>
          <div className="border-t border-neutral-800" />
          <div>{terminalSlot}</div>
        </>
      )}
    </div>
  );
}
