import { useRef, useEffect, useState, useCallback } from "react";
import type { AgentToolEvent } from "../lib/types.js";

interface TerminalViewProps {
  events: AgentToolEvent[];
  isOpen: boolean;
}

const READ_TOOLS = new Set(["read", "grep", "find", "ls", "Read", "Grep", "Glob"]);
const WRITE_TOOLS = new Set(["write", "edit", "Write", "Edit"]);
const BASH_TOOLS = new Set(["bash", "Bash"]);

function eventColor(event: AgentToolEvent): string {
  if (event.status === "failed") return "text-red-400";
  if (READ_TOOLS.has(event.toolName)) return "text-neutral-500";
  if (WRITE_TOOLS.has(event.toolName)) return "text-emerald-400";
  if (BASH_TOOLS.has(event.toolName)) return "text-amber-400";
  return "text-neutral-300";
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}\u2026` : str;
}

function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export function TerminalView({ events, isOpen }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [hasNewEvents, setHasNewEvents] = useState(false);
  const prevEventCount = useRef(events.length);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    setAutoScroll(atBottom);
    if (atBottom) setHasNewEvents(false);
  }, []);

  // Auto-scroll on new events
  useEffect(() => {
    if (!isOpen) return;
    if (events.length > prevEventCount.current && !autoScroll) {
      setHasNewEvents(true);
    }
    prevEventCount.current = events.length;

    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, autoScroll, isOpen]);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    setAutoScroll(true);
    setHasNewEvents(false);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-80 overflow-y-auto bg-[#0d1117] font-mono text-xs p-3 space-y-2"
      >
        {events.length === 0 && (
          <span className="text-neutral-600">Waiting for agent events...</span>
        )}
        {events.map((event, i) => {
          const color = eventColor(event);
          return (
            <div key={`${event.timestamp}-${i}`} className={color}>
              <div className="flex items-baseline gap-2">
                <span className="text-neutral-600 shrink-0 select-none">
                  {relativeTime(event.timestamp)}
                </span>
                <span>
                  <span className="opacity-50 select-none">&gt; </span>
                  <span className="font-semibold">{event.toolName}</span>
                  {": "}
                  {truncate(event.input, 120)}
                </span>
              </div>
              {event.output && (
                <div className="pl-4 text-neutral-500 mt-0.5">
                  {truncate(event.output, 200)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New events badge */}
      {hasNewEvents && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-2 right-3 px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono hover:bg-neutral-700 transition"
        >
          ↓ New events
        </button>
      )}
    </div>
  );
}
