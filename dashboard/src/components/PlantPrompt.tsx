import { useState, useCallback } from "react";
import type { WorkStream } from "../lib/types.js";

interface PlantPromptProps {
  slot: number;
  workStreamIds: string[];
  workStreams: Record<string, WorkStream>;
  onPlant: (slot: number) => void;
}

export function PlantPrompt({ slot, workStreamIds, workStreams, onPlant }: PlantPromptProps) {
  const [planting, setPlanting] = useState(false);

  const handlePlant = useCallback(() => {
    setPlanting(true);
    onPlant(slot);
  }, [onPlant, slot]);

  return (
    <div
      className={
        "relative rounded-xl px-5 py-5 " +
        "bg-gradient-to-b from-emerald-950/40 via-neutral-900 to-neutral-950 " +
        "border border-emerald-700/30 " +
        "shadow-[0_0_24px_-4px_rgba(16,185,129,0.10)]"
      }
    >
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent rounded-t-xl" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500/80">
            Phase {slot}
          </p>
          <h3 className="mt-1 text-base font-medium text-neutral-100">
            Ready to plant
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            {workStreamIds.length} work stream{workStreamIds.length !== 1 ? "s" : ""} launching
            in parallel
          </p>
        </div>

        <button
          type="button"
          onClick={handlePlant}
          disabled={planting}
          className={
            "shrink-0 mt-1 " +
            "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 " +
            "text-white rounded-lg " +
            "px-5 py-2 text-sm font-semibold " +
            "shadow-sm shadow-emerald-900/40 " +
            "transition-colors " +
            "disabled:opacity-50 disabled:cursor-not-allowed"
          }
        >
          {planting ? "Planting\u2026" : `Plant T${slot}`}
        </button>
      </div>

      {/* Work stream manifest */}
      <div className="mt-4 rounded-lg bg-neutral-950/60 border border-neutral-800/50 px-3 py-2.5">
        <ul className="space-y-1.5">
          {workStreamIds.map((id) => {
            const ws = workStreams[id];
            return (
              <li key={id} className="text-sm text-neutral-400 flex items-baseline gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600/60 shrink-0 translate-y-[-1px]" />
                <span className="font-mono text-neutral-300 text-xs">{id}</span>
                {ws && (
                  <>
                    <span className="text-neutral-600">&mdash;</span>
                    <span className="truncate">{ws.name}</span>
                    {ws.model && (
                      <span className="ml-auto text-[11px] text-neutral-600 shrink-0">{ws.model}</span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
