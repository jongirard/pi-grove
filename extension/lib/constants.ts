import type { WorkStreamStatus } from "./types.js";

export const GROVE_DIR = ".pi/grove";
export const PLAN_FILE = "plan.json";
export const STATE_FILE = "state.json";
export const SERVER_FILE = "server.json";
export const DEFAULT_PORT_RANGE = [4700, 4799] as const;
export const WS_PATH = "/ws";

export const DASHBOARD_DIST_PATH = new URL(
  "../../dashboard/dist",
  import.meta.url,
).pathname;

export const STATUS_LABELS: Record<WorkStreamStatus, string> = {
  pending: "Pending",
  ready: "Ready",
  running: "Running",
  agent_complete: "Agent Complete",
  verifying: "Verifying",
  done: "Done",
  needs_attention: "Needs Attention",
};
