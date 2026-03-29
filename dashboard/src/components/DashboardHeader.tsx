import { Sprout } from "lucide-react";

interface DashboardHeaderProps {
  planName: string | null;
  aggregateMetrics: {
    totalCost: number;
    totalTokens: number;
    totalToolCalls: number;
  };
  branchMode: boolean;
  onToggleBranchMode: () => void;
}

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

export function DashboardHeader({
  planName,
  aggregateMetrics,
  branchMode,
  onToggleBranchMode,
}: DashboardHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4">
      <div className="flex items-center gap-3">
        <Sprout className="w-5 h-5 text-emerald-600" aria-label="Grove logo" />
        <span className="text-sm font-semibold text-neutral-100">
          {planName ?? "Grove"}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-xs text-neutral-400">
          <span>
            ${aggregateMetrics.totalCost.toFixed(2)}
          </span>
          <span>{formatTokens(aggregateMetrics.totalTokens)} tokens</span>
          <span>{aggregateMetrics.totalToolCalls} tool calls</span>
        </div>

        <button
          type="button"
          onClick={onToggleBranchMode}
          className="flex items-center gap-2 text-xs"
        >
          <span className="text-neutral-400">Branch mode</span>
          <div
            className={`relative h-5 w-9 rounded-full transition-colors ${
              branchMode ? "bg-emerald-500" : "bg-neutral-700"
            }`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                branchMode ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
        </button>
      </div>
    </header>
  );
}
