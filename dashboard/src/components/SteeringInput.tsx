import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import type { WorkStreamStatus } from "../lib/types.js";

interface SteeringInputProps {
  workStreamId: string;
  status: WorkStreamStatus;
  onSend: (message: string) => void;
}

const ENABLED_STATUSES: Set<WorkStreamStatus> = new Set([
  "running",
  "done",
  "needs_attention",
]);

function getPlaceholder(status: WorkStreamStatus): string {
  switch (status) {
    case "running":
      return "Send steering message\u2026";
    case "done":
      return "Send message to re-run\u2026";
    case "needs_attention":
      return "Send fix instructions\u2026";
    default:
      return "Steering unavailable";
  }
}

function getButtonLabel(status: WorkStreamStatus): string {
  return status === "done" || status === "needs_attention" ? "Re-run" : "Send";
}

export function SteeringInput({ workStreamId, status, onSend }: SteeringInputProps) {
  const [message, setMessage] = useState("");
  const [sentIndicator, setSentIndicator] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = ENABLED_STATUSES.has(status);
  const canSend = enabled && message.trim().length > 0;

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Reset message when workStreamId changes
  useEffect(() => {
    setMessage("");
    setSentIndicator(false);
  }, [workStreamId]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const text = message.trim();
    onSend(text);
    setMessage("");
    setSentIndicator(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSentIndicator(false);
    }, 2000);
  }, [canSend, message, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder(status)}
          disabled={!enabled}
          className={
            "flex-1 resize-none bg-neutral-800 border border-neutral-700 rounded-md " +
            "px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 " +
            "focus:outline-none focus:border-emerald-500 " +
            "disabled:opacity-50 disabled:cursor-not-allowed"
          }
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className={
            "bg-emerald-600 hover:bg-emerald-500 text-white rounded-md " +
            "px-4 py-1.5 text-sm font-medium " +
            "disabled:opacity-50 disabled:cursor-not-allowed"
          }
        >
          {getButtonLabel(status)}
        </button>
      </div>

      {sentIndicator && (
        <span className="text-xs text-emerald-400">Steering agent&hellip;</span>
      )}
    </div>
  );
}
