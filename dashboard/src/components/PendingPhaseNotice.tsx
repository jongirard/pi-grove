import { Clock } from "lucide-react";

interface PendingPhaseNoticeProps {
  previousPhase: number;
}

export function PendingPhaseNotice({ previousPhase }: PendingPhaseNoticeProps) {
  return (
    <div
      className={
        "relative rounded-xl px-5 py-5 " +
        "bg-neutral-900/60 " +
        "border border-neutral-800/50"
      }
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-lg bg-neutral-800/80 flex items-center justify-center">
          <Clock className="w-3.5 h-3.5 text-neutral-500" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-neutral-400">
            Waiting to grow
          </h3>
          <p className="mt-0.5 text-xs text-neutral-600">
            This phase will be ready for planting once Phase {previousPhase} has
            finished growing
          </p>
        </div>
      </div>
    </div>
  );
}
