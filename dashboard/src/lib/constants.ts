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
