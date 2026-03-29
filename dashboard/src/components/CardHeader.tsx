import type { WorkStream, AgentMetrics } from "../lib/types.js";
import { STATUS_LABELS, STATUS_BADGE_COLORS } from "../lib/constants.js";
import { formatCost, formatTokens, formatElapsed } from "../hooks/useAgentMetrics.js";

interface CardHeaderProps {
  workStream: WorkStream;
  metrics: AgentMetrics;
  onToggleTerminal?: () => void;
}

function extractFilename(filepath: string | null): string | null {
  if (!filepath) return null;
  const parts = filepath.split("/");
  return parts[parts.length - 1] ?? null;
}

export function CardHeader({ workStream, metrics, onToggleTerminal }: CardHeaderProps) {
  const badgeClasses = STATUS_BADGE_COLORS[workStream.status];
  const label = STATUS_LABELS[workStream.status];
  const filename = extractFilename(metrics.currentFile);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 min-w-0">
      {/* ID + Name */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs text-neutral-500 shrink-0">
          {workStream.id}
        </span>
        <span className="text-sm text-neutral-100 truncate">
          {workStream.name}
        </span>
      </div>

      {/* Status badge */}
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClasses}`}
      >
        {label}
      </span>

      {/* Metrics cluster */}
      <div className="flex items-center gap-3 ml-auto text-xs text-neutral-400">
        {metrics.toolCalls > 0 && (
          <span className="font-mono" title="Tool calls">
            <span className="text-neutral-500 mr-1">wrench</span>
            {metrics.toolCalls}
          </span>
        )}
        {metrics.estimatedCost > 0 && (
          <span className="font-mono" title="Estimated cost">
            ~{formatCost(metrics.estimatedCost)}
          </span>
        )}
        {metrics.tokensUsed > 0 && (
          <span className="font-mono" title="Tokens used">
            {formatTokens(metrics.tokensUsed)}
          </span>
        )}
        {metrics.elapsedMs > 0 && (
          <span className="font-mono" title="Elapsed time">
            {formatElapsed(metrics.elapsedMs)}
          </span>
        )}
        {filename && (
          <span
            className="font-mono text-neutral-500 truncate max-w-[120px]"
            title={metrics.currentFile ?? undefined}
          >
            {filename}
          </span>
        )}
      </div>

      {/* Terminal toggle */}
      {onToggleTerminal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleTerminal();
          }}
          className="text-neutral-500 hover:text-neutral-300 transition text-sm ml-1 shrink-0"
          title="Toggle terminal"
        >
          &#x2922;
        </button>
      )}
    </div>
  );
}
