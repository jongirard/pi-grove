import type { WorkStreamStatus } from "./types.js";

export const STATUS_LABELS: Record<WorkStreamStatus, string> = {
  pending: "Pending",
  ready: "Ready",
  running: "Running",
  agent_complete: "Agent Complete",
  verifying: "Verifying",
  done: "Done",
  needs_attention: "Needs Attention",
};

export const STATUS_COLORS: Record<WorkStreamStatus, string> = {
  pending: "text-neutral-500",
  ready: "text-sky-400",
  running: "text-amber-400",
  agent_complete: "text-violet-400",
  verifying: "text-cyan-400",
  done: "text-emerald-400",
  needs_attention: "text-red-400",
};

export const STATUS_ICONS: Record<WorkStreamStatus, string> = {
  pending: "○",
  ready: "◎",
  running: "●",
  agent_complete: "◈",
  verifying: "◐",
  done: "✓",
  needs_attention: "⚠",
};

export const STATUS_BADGE_COLORS: Record<WorkStreamStatus, string> = {
  pending: "bg-neutral-800 text-neutral-400",
  ready: "bg-sky-950 text-sky-400",
  running: "bg-amber-950 text-amber-400",
  agent_complete: "bg-violet-950 text-violet-400",
  verifying: "bg-cyan-950 text-cyan-400",
  done: "bg-emerald-950 text-emerald-400",
  needs_attention: "bg-red-950 text-red-400",
};
