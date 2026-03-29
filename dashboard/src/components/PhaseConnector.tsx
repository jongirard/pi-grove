interface PhaseConnectorProps {
  nextPhase: number;
  /** Whether the next phase is ready to plant (current phase completed). */
  isReady: boolean;
  onNavigate: (phase: number) => void;
}

/**
 * Visual connector between phases — a timeline dot, dotted vertical line,
 * and a pill button linking to the next phase. Mirrors StepTimeline's
 * dot/line language and PlantPrompt's button treatment.
 */
export function PhaseConnector({ nextPhase, isReady, onNavigate }: PhaseConnectorProps) {
  const dotColor = isReady ? "text-emerald-400" : "text-neutral-600";

  const lineColor = isReady
    ? "border-emerald-600/50"
    : "border-neutral-700/60";

  const buttonClasses = isReady
    ? "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm shadow-emerald-900/40"
    : "bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800 text-neutral-400";

  return (
    <div className="flex flex-col items-start pt-4">
      {/* Timeline track — same w-5 column as StepTimeline */}
      <div className="flex flex-col items-center w-5">
        {/* Dot — matches StepTimeline pending/complete circles */}
        <span className={`${dotColor} leading-5 text-sm`}>{"\u25CB"}</span>

        {/* Dotted line — half height */}
        <div
          className={`h-[70px] w-px border-l border-dotted ${lineColor}`}
        />
      </div>

      {/* Next phase button — matches Plant button exactly (px-5 py-2.5 text-sm) */}
      <button
        type="button"
        onClick={() => onNavigate(nextPhase)}
        className={`mt-2.5 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${buttonClasses}`}
      >
        Phase {nextPhase}
      </button>
    </div>
  );
}
