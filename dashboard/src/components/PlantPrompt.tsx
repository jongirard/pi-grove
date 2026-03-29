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
        "bg-gradient-to-r from-emerald-950/20 to-neutral-900 " +
        "border border-dashed border-emerald-800/50 rounded-lg p-4"
      }
    >
      <h3 className="text-lg font-medium text-neutral-100">
        Time Slot {slot} ready to plant
      </h3>
      <p className="mt-1 text-sm text-neutral-400">
        {workStreamIds.length} work stream{workStreamIds.length !== 1 ? "s" : ""} will
        be launched in parallel.
      </p>

      <ul className="mt-3 space-y-1">
        {workStreamIds.map((id) => {
          const ws = workStreams[id];
          return (
            <li key={id} className="text-sm text-neutral-400 flex items-baseline gap-2">
              <span className="font-mono text-neutral-300">{id}</span>
              {ws && (
                <>
                  <span className="text-neutral-600">&mdash;</span>
                  <span>{ws.name}</span>
                  {ws.model && (
                    <span className="ml-auto text-xs text-neutral-500">{ws.model}</span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handlePlant}
          disabled={planting}
          className={
            "bg-emerald-600 hover:bg-emerald-500 text-white rounded-md " +
            "px-4 py-1.5 text-sm font-medium " +
            "disabled:opacity-50 disabled:cursor-not-allowed"
          }
        >
          {planting ? "Planting\u2026" : `\u{1F331} Plant T${slot}`}
        </button>
      </div>
    </div>
  );
}
