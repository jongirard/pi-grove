import { useState, useCallback, useMemo, useEffect } from "react";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { useSimulation } from "./hooks/useSimulation.js";
import { usePlanState } from "./hooks/usePlanState.js";
import { DashboardHeader } from "./components/DashboardHeader.js";
import { Sidebar } from "./components/Sidebar.js";
import { CardGrid } from "./components/CardGrid.js";

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

const isDemoMode = new URLSearchParams(window.location.search).has("demo");

export function App() {
  const wsUrl = useMemo(() => getWebSocketUrl(), []);
  const ws = useWebSocket(isDemoMode ? "" : wsUrl);
  const sim = useSimulation();
  const { connected, sendCommand, lastEvent, events } = isDemoMode ? sim : ws;
  const { plan, workStreams, timeSlots, aggregateMetrics } = usePlanState(
    events,
    lastEvent,
  );

  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [branchMode, setBranchMode] = useState(false);

  // Auto-select the first actionable phase when plan loads
  useEffect(() => {
    if (timeSlots.length === 0 || selectedPhase !== null) return;

    // Find first phase that's ready or has running streams
    const actionablePhase = timeSlots.find((slot) => {
      const streams = slot.workStreamIds
        .map((id) => workStreams[id])
        .filter(Boolean);
      return streams.some(
        (ws) =>
          ws.status === "ready" ||
          ws.status === "running" ||
          ws.status === "needs_attention",
      );
    });

    if (actionablePhase) {
      setSelectedPhase(actionablePhase.slot);
    }
  }, [timeSlots, workStreams, selectedPhase]);

  const handleToggleBranchMode = useCallback(() => {
    const next = !branchMode;
    setBranchMode(next);
    sendCommand({ type: "set_branch_mode", enabled: next });
  }, [branchMode, sendCommand]);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <DashboardHeader
        planName={plan?.name ?? null}
        aggregateMetrics={aggregateMetrics}
        branchMode={branchMode}
        onToggleBranchMode={handleToggleBranchMode}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          plan={plan}
          workStreams={workStreams}
          timeSlots={timeSlots}
          selectedPhase={selectedPhase}
          onSelectPhase={setSelectedPhase}
        />

        <main className="flex-1 overflow-y-auto px-5 py-4">
          {!connected && !isDemoMode && (
            <div className="absolute right-4 top-14 rounded-md bg-red-900/60 px-3 py-1.5 text-xs text-red-300">
              Disconnected — reconnecting...
            </div>
          )}
          {isDemoMode && (
            <div className="absolute right-4 top-14 rounded-md bg-amber-900/40 border border-amber-800/50 px-3 py-1.5 text-xs text-amber-400">
              Demo mode — simulated data
            </div>
          )}

          <CardGrid
            workStreams={workStreams}
            timeSlots={timeSlots}
            events={events}
            sendCommand={sendCommand}
            selectedPhase={selectedPhase}
            onSelectPhase={setSelectedPhase}
          />
        </main>
      </div>
    </div>
  );
}
